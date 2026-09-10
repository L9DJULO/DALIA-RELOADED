"""Refresh patches; train only on new data, activate only validated candidates."""
import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import subprocess
import shutil
import sys
import time
from app.services.storage import write_json

log = logging.getLogger("dalia.patch")
MODEL_DIR = Path(__file__).resolve().parents[1] / "data/models"
MATCHES = Path(__file__).resolve().parents[1] / "data/matches/matches.jsonl"


class PatchWatcher:
    def __init__(self, fetcher, check_interval=3600., engine=None):
        self._fetcher, self._interval, self.engine = fetcher, check_interval, engine
        self._task = self._training_task = self._process = None
        self._status, self._last_error, self._started = "idle", None, None
        try: self._meta = json.loads((MODEL_DIR / "training_meta.json").read_text(encoding="utf-8"))
        except (OSError, ValueError): self._meta = {}

    @property
    def status(self): return self._status

    @property
    def last_trained_patch(self): return self._meta.get("last_trained_patch")

    def get_status_dict(self):
        return {**self._meta, "status": self._status, "last_error": self._last_error,
                "available": self.engine is not None and self.engine.ml is not None,
                "training_elapsed": round(time.time() - self._started, 1) if self._started else None}

    def save(self): write_json(MODEL_DIR / "training_meta.json", self._meta)

    async def check_and_retrain(self):
        try:
            version = await self._fetcher.get_ddragon_version(force=True)
            patch = ".".join(version.split(".")[:2])
            previous = self._meta.get("current_patch")
            # The catalogue was loaded moments ago at startup: only a real patch
            # change justifies reloading champions and dropping every cache.
            changed = previous is not None and patch != previous
            self._meta.update(current_patch=patch, needs_retrain=patch != self.last_trained_patch)
            if changed and self.engine:
                await self.engine.db.initialize()
                self.engine.meta._loaded_roles.clear()
                self.engine.meta._loaded_at.clear()
                self.engine.matchup._matchup_cache.clear()
                self.engine.matchup._loaded_at.clear()
            # Check on every startup, even if persisted watcher metadata is current.
            if self.engine and self.engine.ml and patch not in self.engine.ml.metadata.get("patches", []):
                self.engine.ml = None
            self.save()
            if os.getenv("AUTO_TRAIN", "0") == "1" and self._meta["needs_retrain"]:
                return self.trigger_retrain()
            return False
        except Exception:
            self._last_error = "Actualisation du patch impossible ; données précédentes conservées."
            log.exception("Patch refresh failed")
            return False

    def trigger_retrain(self):
        if self._training_task and not self._training_task.done(): return False
        if not MATCHES.exists():
            self._status = "awaiting_data"
            self._last_error = "Collecte de matchs requise avant l'entraînement."
            return False
        patch = self._meta.get("current_patch")
        if not patch:
            self._last_error = "Patch actuel non résolu."
            return False
        self._training_task = asyncio.create_task(self._train(patch))
        return True

    async def _train(self, patch):
        try:
            from app.ml.training_data import load_splits
            _, metadata = await asyncio.to_thread(load_splits, MATCHES, patch)
            if metadata["unique_matches"] < 2000 or metadata["dataset_sha256"] == self._meta.get("last_attempt_dataset"):
                self._status = "awaiting_data"
                self._last_error = "Il faut au moins 2 000 matchs uniques du patch et de nouvelles données depuis la dernière tentative."
                return
            self._status, self._last_error, self._started = "training", None, time.time()
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            # File output cannot deadlock on an undrained PIPE; bounded training log per run.
            with (MODEL_DIR / "training.log").open("w", encoding="utf-8") as output:
                self._process = subprocess.Popen([sys.executable, "-m", "app.ml.train", "--patch", patch],
                    cwd=Path(__file__).resolve().parents[2], stdout=output, stderr=subprocess.STDOUT, creationflags=flags)
                while self._process.poll() is None: await asyncio.sleep(1)
                if self._process.returncode != 0: raise RuntimeError("Le processus d'entraînement a échoué ; consulter training.log.")
            stats = json.loads((MODEL_DIR / "training_stats.json").read_text(encoding="utf-8"))
            # Only a completed evaluation consumes the dataset: a crashed run
            # (missing torch, OOM, bug) must stay retryable after the fix.
            self._meta["last_attempt_dataset"] = metadata["dataset_sha256"]
            self.save()
            if not stats.get("accepted"):
                self._status = "rejected"
                self._last_error = "Le candidat n'a pas passé les critères de validation ; modèle actif conservé."
                return
            if self._meta.get("current_patch") != patch:
                self._status = "rejected"
                self._last_error = "Le patch a changé pendant l'entraînement."
                return
            from app.ml.predictor import MLPredictor
            candidate_path = MODEL_DIR / "draft_model.candidate.pt"
            predictor = await asyncio.to_thread(MLPredictor, self.engine.db, str(candidate_path)) if self.engine else None
            if not predictor or not predictor.is_available(): raise RuntimeError("Le candidat ne peut pas être chargé.")
            active = MODEL_DIR / "draft_model.pt"
            if active.exists():
                shutil.copy2(active, MODEL_DIR / "draft_model.previous.tmp")
                os.replace(MODEL_DIR / "draft_model.previous.tmp", MODEL_DIR / "draft_model.previous.pt")
            os.replace(candidate_path, active)
            self.engine.ml = predictor
            self._meta.update(last_trained_patch=patch, last_trained_at=datetime.now(timezone.utc).isoformat(),
                              last_val_accuracy=stats["best_val_accuracy"], last_training_duration=stats["training_time_seconds"],
                              needs_retrain=False, test_metrics=stats["test_metrics"])
            self.save(); self._status = "trained"
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._status, self._last_error = "error", str(exc)
            log.exception("Training failed")
        finally:
            if self._process and self._process.poll() is None:
                self._process.terminate()
                try: await asyncio.to_thread(self._process.wait, 5)
                except subprocess.TimeoutExpired:
                    self._process.kill(); await asyncio.to_thread(self._process.wait)
            self._process = None; self._started = None

    async def reload_model(self):
        from app.ml.predictor import MLPredictor
        candidate = await asyncio.to_thread(MLPredictor, self.engine.db)
        if not candidate.is_available() or self._meta.get("current_patch") not in candidate.metadata.get("patches", []):
            return False
        self.engine.ml = candidate
        return True

    async def start(self):
        if not self._task: self._task = asyncio.create_task(self._loop())

    async def _loop(self):
        while True:
            await self.check_and_retrain()
            await asyncio.sleep(self._interval)

    async def stop(self):
        tasks = [t for t in (self._task, self._training_task) if t]
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._task = self._training_task = None
