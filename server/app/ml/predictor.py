"""DALIA ML Predictor — integrates the trained model into the draft engine.

Loads the PyTorch model and provides a score(candidate, role, draft) method
that returns 0-100, compatible with the other sub-scorers.

If the model file doesn't exist, gracefully returns 50 (neutral).
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app.models.draft import DraftPick, DraftState
from app.services.champion_data import ChampionDatabase

logger = logging.getLogger("dalia.ml.predictor")

# Lazy torch import — don't fail on startup if torch not installed
_torch = None
_DraftNet = None


def _ensure_torch():
    global _torch, _DraftNet
    if _torch is None:
        try:
            import torch
            from app.ml.model import DraftNet
            _torch = torch
            _DraftNet = DraftNet
        except ImportError:
            logger.warning("PyTorch not installed — ML predictor disabled")
            return False
    return True


# Role mapping: draft role string → model position index
_ROLE_TO_IDX = {"top": 0, "jungle": 1, "mid": 2, "bot": 3, "support": 4}


class MLPredictor:
    """Draft win-probability predictor using the trained neural network."""

    def __init__(self, champion_db: ChampionDatabase, model_path: Optional[str] = None):
        self.db = champion_db
        self._model = None
        self._available = False
        self._champ_game_counts: Dict[int, int] = {}
        self._total_training_games: int = 0

        if model_path is None:
            model_path = str(
                Path(__file__).resolve().parent.parent / "data" / "models" / "draft_model.pt"
            )
        self._model_path = model_path
        self._load_model()
        self._load_game_counts()

    def _load_model(self):
        """Try to load the trained model. Silently skip if unavailable."""
        if not _ensure_torch():
            return

        path = Path(self._model_path)
        if not path.exists():
            logger.info("No ML model found at %s — predictor disabled", path)
            return

        try:
            ckpt = _torch.load(path, map_location="cpu", weights_only=True)
            embed_dim = ckpt.get("embed_dim", 32)
            hidden_dim = ckpt.get("hidden_dim", 256)

            self._model = _DraftNet(embed_dim=embed_dim, hidden_dim=hidden_dim)
            self._model.load_state_dict(ckpt["model_state"])
            self._model.eval()
            self._available = True

            val_acc = ckpt.get("val_accuracy", "?")
            epoch = ckpt.get("epoch", "?")
            logger.info(
                "ML model loaded (epoch=%s, val_acc=%.3f)", epoch, val_acc if isinstance(val_acc, float) else 0
            )
        except Exception as e:
            logger.warning("Failed to load ML model: %s", e)
            self._available = False

    def _load_game_counts(self):
        """Count champion appearances in training data for confidence estimation."""
        matches_path = Path(__file__).resolve().parent.parent / "data" / "matches" / "matches.jsonl"
        if not matches_path.exists():
            logger.info("No matches.jsonl — cannot compute game counts")
            return
        counts: Dict[int, int] = {}
        total = 0
        try:
            with open(matches_path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    m = json.loads(line)
                    total += 1
                    for k in ["blue_top", "blue_jg", "blue_mid", "blue_bot", "blue_sup",
                              "red_top", "red_jg", "red_mid", "red_bot", "red_sup"]:
                        cid = m.get(k, 0)
                        if cid > 0:
                            counts[cid] = counts.get(cid, 0) + 1
            self._champ_game_counts = counts
            self._total_training_games = total
            logger.info("Loaded game counts for %d champions from %d matches", len(counts), total)
        except Exception as e:
            logger.warning("Failed to load game counts: %s", e)

    def is_available(self) -> bool:
        return self._available

    def _build_team_vector(self, picks: List[DraftPick], candidate_id: int = 0, candidate_role: str = "") -> List[int]:
        """Build [top, jg, mid, bot, sup] champion ID vector from draft picks."""
        team = [0, 0, 0, 0, 0]

        for pick in picks:
            if pick.champion_id is None or pick.role is None:
                continue
            idx = _ROLE_TO_IDX.get(pick.role)
            if idx is not None:
                team[idx] = pick.champion_id

        # Place candidate
        if candidate_id > 0 and candidate_role:
            idx = _ROLE_TO_IDX.get(candidate_role)
            if idx is not None:
                team[idx] = candidate_id

        return team

    def _count_known(self, draft: DraftState, candidate_id: int, role: str) -> int:
        """Count how many of the 10 champion slots are filled."""
        blue = self._build_team_vector(draft.ally_picks, candidate_id, role)
        red = self._build_team_vector(draft.enemy_picks)
        if draft.my_team == "red":
            blue, red = red, blue
        return sum(1 for c in blue + red if c > 0)

    def predict_win_probability(
        self, candidate_id: int, role: str, draft: DraftState,
    ) -> float:
        """Predict P(our team wins) with candidate in role."""
        if not self._available or self._model is None:
            return 0.5

        blue_team = self._build_team_vector(draft.ally_picks, candidate_id, role)
        red_team = self._build_team_vector(draft.enemy_picks)

        if draft.my_team == "red":
            blue_team, red_team = red_team, blue_team
            flip = True
        else:
            flip = False

        known = sum(1 for c in blue_team + red_team if c > 0)
        if known < 4:
            return 0.5

        try:
            prob = self._model.predict_proba(blue_team, red_team)
            if flip:
                prob = 1.0 - prob
            return prob
        except Exception as e:
            logger.warning("ML prediction error: %s", e)
            return 0.5

    # ─── Temperature scaling (standard ML calibration) ─────────────────
    TEMPERATURE = 5.0  # T > 1 softens overconfident predictions toward 50%

    def _calibrate(self, p: float) -> float:
        """Temperature-scale the raw model probability.

        The model (~60% accuracy) outputs extreme probabilities (5% / 95%).
        Temperature scaling in logit space is the standard calibration fix:
          logit = log(p / (1-p))
          logit_cal = logit / T
          p_cal = sigmoid(logit_cal)

        With T=5: P=0.05 → 0.36,  P=0.95 → 0.64  (much more reasonable)
        """
        p = max(1e-6, min(1 - 1e-6, p))
        logit = math.log(p / (1 - p))
        logit_cal = logit / self.TEMPERATURE
        return 1.0 / (1.0 + math.exp(-logit_cal))

    def _p_to_score(self, p: float) -> float:
        """Convert raw probability to 0-100 score.

        1. Temperature-scale the raw P (pulls extremes toward 0.5)
        2. Map calibrated P to score with moderate scaling
        Result: scores realistically range ~30-70 for a 60%-accuracy model.
        """
        p_cal = self._calibrate(p)
        raw = 50.0 + (p_cal - 0.5) * 100.0
        return round(max(30.0, min(70.0, raw)), 1)

    def score(self, candidate_id: int, role: str, draft: DraftState) -> float:
        """Return 0-100 score for the draft engine."""
        p = self.predict_win_probability(candidate_id, role, draft)
        return self._p_to_score(p)

    def score_with_explanation(
        self, candidate_id: int, role: str, draft: DraftState,
    ) -> Tuple[float, dict]:
        """Return (score 0-100, explanation dict)."""
        p_raw = self.predict_win_probability(candidate_id, role, draft)
        p_cal = self._calibrate(p_raw)
        s = self._p_to_score(p_raw)
        expl = self._build_explanation(candidate_id, role, draft, p_raw, p_cal, s)
        return s, expl

    def _build_explanation(
        self, candidate_id: int, role: str, draft: DraftState,
        prob_raw: float, prob_cal: float, score: float,
    ) -> dict:
        """Build a human-readable explanation dict for the ML prediction."""
        known = self._count_known(draft, candidate_id, role)
        games = self._champ_game_counts.get(candidate_id, 0)
        champ = self.db.get_by_id(candidate_id)
        name = champ.name if champ else f"Champion {candidate_id}"

        # Confidence based on data quality
        if known >= 8 and games >= 200:
            confidence = "high"
        elif known >= 6 and games >= 80:
            confidence = "medium"
        else:
            confidence = "low"

        reasons: List[str] = []

        # ── 1. Win probability (use calibrated value for user-facing text as WPA) ──
        wpa_cal = (prob_cal - 0.5) * 100
        wpa_str = f"{wpa_cal:+.1f}% WPA"
        pct_raw = f"{prob_raw:.0%}"
        if prob_cal >= 0.56:
            reasons.append(f"Le modèle prédit un avantage ({wpa_str}) avec {name}")
        elif prob_cal >= 0.52:
            reasons.append(f"Le modèle prédit un léger avantage ({wpa_str}) avec {name}")
        elif prob_cal <= 0.44:
            reasons.append(f"Le modèle prédit un désavantage ({wpa_str}) avec {name}")
        elif prob_cal <= 0.48:
            reasons.append(f"Le modèle prédit un léger désavantage ({wpa_str}) avec {name}")
        else:
            reasons.append(f"Le modèle prédit un match équilibré ({wpa_str}) avec {name}")

        # Show raw value for transparency
        if abs(prob_raw - prob_cal) > 0.05:
            reasons.append(
                f"(Valeur brute du modèle : {pct_raw} — ajustée car le modèle est sur-confiant)"
            )

        # ── 2. Data quality warnings ──
        if games < 50:
            reasons.append(
                f"⚠ Très peu de données : {name} vu dans seulement {games} games "
                f"d'entraînement → prédiction peu fiable"
            )
        elif games < 150:
            reasons.append(f"Données limitées : {name} vu dans {games} games d'entraînement")
        else:
            reasons.append(f"Données OK : {name} vu dans {games} games d'entraînement")

        # ── 3. Draft completeness ──
        if known < 6:
            reasons.append(
                f"Draft partiel ({known}/10 champions connus) → prédiction moins précise"
            )
        elif known >= 9:
            reasons.append(f"Draft quasi-complet ({known}/10) → prédiction plus fiable")

        # ── 4. Model accuracy reminder ──
        reasons.append(
            f"Précision du modèle : ~60% (entraîné sur {self._total_training_games} games D2+)"
        )

        # ── 5. Confidence summary ──
        conf_labels = {"high": "élevée", "medium": "moyenne", "low": "faible"}
        reasons.append(f"Confiance globale : {conf_labels[confidence]}")

        return {
            "win_probability": round(prob_cal, 4),
            "win_probability_raw": round(prob_raw, 4),
            "confidence": confidence,
            "known_champions": known,
            "champion_games": games,
            "reasons": reasons,
        }

    # ── Confidence interval ──────────────────────────────────────────────

    def compute_confidence_interval(
        self, candidate_id: int, role: str, draft: DraftState,
    ) -> Tuple[float, float]:
        """Compute a ±X confidence interval around the ML score.

        The interval width depends on:
          1. Champion training data (fewer games → wider)
          2. Draft completeness (fewer picks revealed → wider)
          3. Base model uncertainty (~60% accuracy → inherent ±)

        Returns: (score_low, score_high) — both 0-100
        """
        p_raw = self.predict_win_probability(candidate_id, role, draft)
        base_score = self._p_to_score(p_raw)
        known = self._count_known(draft, candidate_id, role)
        games = self._champ_game_counts.get(candidate_id, 0)

        # Half-width of the interval (in score points)
        # Base uncertainty: ~60% model accuracy → inherent ±6
        hw = 6.0

        # Draft completeness penalty: less info = wider interval
        # known=10 → +0, known=4 → +6, known=2 → +8
        if known < 10:
            hw += (10 - known) * 1.0

        # Champion data scarcity penalty
        if games < 30:
            hw += 8.0   # almost no data → very wide
        elif games < 80:
            hw += 5.0
        elif games < 200:
            hw += 2.5
        # games >= 200 → no extra penalty

        # Predictions near 50 are more uncertain
        deviation = abs(base_score - 50.0)
        if deviation < 5:
            hw += 2.0  # model is unsure → widen

        hw = min(hw, 20.0)  # cap at ±20

        lo = round(max(5.0, base_score - hw), 1)
        hi = round(min(98.0, base_score + hw), 1)
        return (lo, hi)

    # ── Champion embeddings ──────────────────────────────────────────────

    def get_champion_embedding(self, champion_id: int, role: str = "mid") -> Optional[List[float]]:
        """Get the role-projected embedding vector for a champion."""
        if not self._available or self._model is None:
            return None
        role_idx = _ROLE_TO_IDX.get(role, 2)
        return self._model.get_role_embedding(champion_id, role_idx)

    def get_similar_champions(
        self, champion_id: int, role: str, n: int = 8,
    ) -> List[dict]:
        """Find champions most similar in embedding space for a given role.

        Returns a list of {champion_id, champion_key, champion_name, similarity}
        sorted by descending cosine similarity.
        """
        if not self._available or self._model is None:
            return []

        role_idx = _ROLE_TO_IDX.get(role, 2)
        target_emb = self._model.get_role_embedding(champion_id, role_idx)
        if target_emb is None:
            return []

        import numpy as np
        target = np.array(target_emb, dtype=np.float32)
        target_norm = np.linalg.norm(target)
        if target_norm < 1e-8:
            return []

        # Get all champions for this role
        role_champs = self.db.champions_for_role(role)
        results = []

        for champ in role_champs:
            if champ.id == champion_id:
                continue
            emb = self._model.get_role_embedding(champ.id, role_idx)
            if emb is None:
                continue
            vec = np.array(emb, dtype=np.float32)
            vec_norm = np.linalg.norm(vec)
            if vec_norm < 1e-8:
                continue
            cos_sim = float(np.dot(target, vec) / (target_norm * vec_norm))
            results.append({
                "champion_id": champ.id,
                "champion_key": champ.key,
                "champion_name": champ.name,
                "similarity": round(cos_sim, 4),
                "image_url": champ.image_url,
            })

        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:n]

    def get_embedding_map(self, role: str = "mid") -> List[dict]:
        """Return 2D projection of all champion embeddings for visualisation.

        Uses PCA to reduce embed_dim → 2D coordinates.
        Returns: [{champion_id, champion_key, champion_name, x, y, cluster}, ...]
        """
        if not self._available or self._model is None:
            return []

        import numpy as np

        role_idx = _ROLE_TO_IDX.get(role, 2)
        role_champs = self.db.champions_for_role(role)

        ids = []
        embeddings = []
        champ_info = {}

        for champ in role_champs:
            emb = self._model.get_role_embedding(champ.id, role_idx)
            if emb is None:
                continue
            ids.append(champ.id)
            embeddings.append(emb)
            champ_info[champ.id] = {
                "champion_key": champ.key,
                "champion_name": champ.name,
                "tags": champ.tags,
                "image_url": champ.image_url,
            }

        if len(embeddings) < 5:
            return []

        X = np.array(embeddings, dtype=np.float32)

        # ── PCA → 2D ──
        X_centered = X - X.mean(axis=0)
        cov = np.cov(X_centered, rowvar=False)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        # Take top 2 components (largest eigenvalues are last)
        top2 = eigenvectors[:, -2:][:, ::-1]
        coords_2d = X_centered @ top2  # (N, 2)

        # ── Simple k-means clustering (k=5 for ~5 playstyle groups) ──
        k = min(5, len(ids))
        labels = self._simple_kmeans(coords_2d, k=k, max_iter=30)

        result = []
        for i, cid in enumerate(ids):
            info = champ_info[cid]
            result.append({
                "champion_id": cid,
                "champion_key": info["champion_key"],
                "champion_name": info["champion_name"],
                "tags": info["tags"],
                "image_url": info["image_url"],
                "x": round(float(coords_2d[i, 0]), 4),
                "y": round(float(coords_2d[i, 1]), 4),
                "cluster": int(labels[i]),
            })

        return result

    @staticmethod
    def _simple_kmeans(X, k: int = 5, max_iter: int = 30):
        """Minimal k-means (no sklearn dependency)."""
        import numpy as np

        n = X.shape[0]
        rng = np.random.RandomState(42)
        centers = X[rng.choice(n, k, replace=False)]

        labels = np.zeros(n, dtype=int)
        for _ in range(max_iter):
            # Assign
            dists = np.linalg.norm(X[:, None] - centers[None, :], axis=2)  # (n, k)
            new_labels = dists.argmin(axis=1)
            if np.array_equal(new_labels, labels):
                break
            labels = new_labels
            # Update centers
            for j in range(k):
                mask = labels == j
                if mask.any():
                    centers[j] = X[mask].mean(axis=0)
        return labels
