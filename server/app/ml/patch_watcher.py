"""DALIA ML — Patch Watcher.

Monitors DDragon versions and triggers automatic model re-training
when a new game patch is detected.

The watcher:
  1. Checks the latest DDragon version periodically
  2. Compares against the last-trained patch stored in training_meta.json
  3. When a new patch is detected, queues a background training run
  4. Produces a status dict for the frontend (GET /ml/status)
"""
from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger("dalia.ml.patch_watcher")

_META_DIR = Path(__file__).resolve().parent.parent / "data" / "models"
_META_PATH = _META_DIR / "training_meta.json"
_TRAIN_SCRIPT = str(Path(__file__).resolve().parent / "train.py")


def _load_meta() -> dict:
    """Load training_meta.json (stores last trained patch, status, etc.)."""
    if _META_PATH.exists():
        try:
            return json.loads(_META_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_meta(meta: dict):
    _META_DIR.mkdir(parents=True, exist_ok=True)
    _META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")


class PatchWatcher:
    """Background service that checks for new patches and triggers retraining."""

    def __init__(self, fetcher, check_interval: float = 3600.0):
        """
        Args:
            fetcher: LolalyticsFetcher instance (for DDragon version checks).
            check_interval: How often to check for new patches, in seconds.
                            Default: 1 hour.
        """
        self._fetcher = fetcher
        self._interval = check_interval
        self._task: Optional[asyncio.Task] = None
        self._training_process: Optional[subprocess.Popen] = None
        self._meta = _load_meta()
        self._status = "idle"  # idle | checking | training | trained | error
        self._last_error: Optional[str] = None
        self._training_start: Optional[float] = None

    # ── Public API ───────────────────────────────────────────────────────

    @property
    def last_trained_patch(self) -> Optional[str]:
        return self._meta.get("last_trained_patch")

    @property
    def status(self) -> str:
        # If training subprocess is running, update status
        if self._training_process is not None:
            poll = self._training_process.poll()
            if poll is None:
                self._status = "training"
            elif poll == 0:
                self._on_training_complete()
            else:
                self._on_training_failed(f"Process exited with code {poll}")
        return self._status

    def get_status_dict(self) -> dict:
        """Return a JSON-serializable status dict for the API."""
        _ = self.status  # refresh
        return {
            "status": self._status,
            "last_trained_patch": self._meta.get("last_trained_patch"),
            "last_trained_at": self._meta.get("last_trained_at"),
            "last_val_accuracy": self._meta.get("last_val_accuracy"),
            "last_training_duration": self._meta.get("last_training_duration"),
            "current_patch": self._meta.get("current_patch"),
            "needs_retrain": self._meta.get("needs_retrain", False),
            "last_error": self._last_error,
            "training_elapsed": (
                round(time.time() - self._training_start, 1)
                if self._training_start and self._status == "training"
                else None
            ),
        }

    async def check_and_retrain(self) -> bool:
        """Check DDragon for a new patch. Start training if new.

        Returns True if training was started.
        """
        self._status = "checking"
        try:
            current_version = await self._fetcher.get_ddragon_version()
            current_patch = ".".join(current_version.split(".")[:2])

            self._meta["current_patch"] = current_patch
            last = self._meta.get("last_trained_patch")

            if last == current_patch:
                logger.debug("Patch %s already trained — nothing to do", current_patch)
                self._status = "idle"
                self._meta["needs_retrain"] = False
                _save_meta(self._meta)
                return False

            logger.info(
                "New patch detected: %s (last trained: %s) — starting training",
                current_patch, last or "never",
            )
            self._meta["needs_retrain"] = True
            _save_meta(self._meta)
            self._start_training()
            return True

        except Exception as e:
            logger.error("Patch check failed: %s", e)
            self._status = "error"
            self._last_error = str(e)
            return False

    def _start_training(self):
        """Launch training as a background subprocess."""
        if self._training_process is not None and self._training_process.poll() is None:
            logger.warning("Training already in progress — skipping")
            return

        self._status = "training"
        self._training_start = time.time()
        self._last_error = None

        python = sys.executable
        cmd = [python, "-m", "app.ml.train", "--epochs", "60"]
        logger.info("Launching training: %s", " ".join(cmd))

        try:
            self._training_process = subprocess.Popen(
                cmd,
                cwd=str(Path(__file__).resolve().parent.parent.parent),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
        except Exception as e:
            logger.error("Failed to start training process: %s", e)
            self._status = "error"
            self._last_error = str(e)
            self._training_process = None

    def _on_training_complete(self):
        """Called when training subprocess finishes successfully."""
        elapsed = time.time() - self._training_start if self._training_start else 0
        self._status = "trained"
        self._training_process = None
        self._training_start = None

        # Read training stats to get accuracy
        stats_path = _META_DIR / "training_stats.json"
        val_acc = None
        if stats_path.exists():
            try:
                stats = json.loads(stats_path.read_text(encoding="utf-8"))
                val_acc = stats.get("best_val_accuracy")
            except Exception:
                pass

        self._meta["last_trained_patch"] = self._meta.get("current_patch", "?")
        self._meta["last_trained_at"] = datetime.now(timezone.utc).isoformat()
        self._meta["last_val_accuracy"] = val_acc
        self._meta["last_training_duration"] = round(elapsed, 1)
        self._meta["needs_retrain"] = False
        _save_meta(self._meta)

        logger.info(
            "Training complete for patch %s (%.1fs, val_acc=%.4f)",
            self._meta["last_trained_patch"], elapsed, val_acc or 0,
        )

    def _on_training_failed(self, reason: str):
        """Called when training subprocess fails."""
        self._status = "error"
        self._last_error = reason
        self._training_process = None
        self._training_start = None
        logger.error("Training failed: %s", reason)

    # ── Background loop ──────────────────────────────────────────────────

    async def start(self):
        """Start the background patch-check loop."""
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._loop())
        logger.info("Patch watcher started (interval=%ds)", self._interval)

        # Immediate first check
        await self.check_and_retrain()

    async def stop(self):
        """Stop the background loop."""
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        # Kill training subprocess if running
        if self._training_process and self._training_process.poll() is None:
            self._training_process.terminate()
            self._training_process = None
        logger.info("Patch watcher stopped")

    async def _loop(self):
        """Periodically check for new patches."""
        while True:
            try:
                await asyncio.sleep(self._interval)
                await self.check_and_retrain()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Patch watcher loop error: %s", e)
                await asyncio.sleep(60)  # retry after 1 min on error

    # ── Manual retrain ───────────────────────────────────────────────────

    def trigger_retrain(self):
        """Manually trigger a retrain (from API)."""
        if self._training_process is not None and self._training_process.poll() is None:
            return False  # already running
        self._start_training()
        return True

    def reload_model(self, predictor):
        """Tell the ML predictor to reload the model from disk.

        Call after training completes so new predictions use the updated weights.
        """
        if predictor is not None:
            try:
                predictor._load_model()
                predictor._load_game_counts()
                logger.info("ML predictor model reloaded after retrain")
            except Exception as e:
                logger.warning("Model reload failed: %s", e)
