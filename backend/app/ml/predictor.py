"""DALIA ML Predictor — integrates the trained model into the draft engine.

Loads the PyTorch model and provides a score(candidate, role, draft) method
that returns 0-100, compatible with the other sub-scorers.

If the model file doesn't exist, gracefully returns 50 (neutral).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional

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

        if model_path is None:
            model_path = str(
                Path(__file__).resolve().parent.parent / "data" / "models" / "draft_model.pt"
            )
        self._model_path = model_path
        self._load_model()

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

    def is_available(self) -> bool:
        return self._available

    def _build_team_vector(self, picks: List[DraftPick], candidate_id: int = 0, candidate_role: str = "") -> List[int]:
        """Build [top, jg, mid, bot, sup] champion ID vector from draft picks.

        Fills known positions, puts candidate in its role, 0 for unknown slots.
        """
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

    def predict_win_probability(
        self, candidate_id: int, role: str, draft: DraftState,
    ) -> float:
        """Predict P(our team wins) with candidate in role.

        Returns 0.5 if model unavailable or draft incomplete.
        """
        if not self._available or self._model is None:
            return 0.5

        # Build team vectors
        blue_team = self._build_team_vector(draft.ally_picks, candidate_id, role)
        red_team = self._build_team_vector(draft.enemy_picks)

        # Account for side
        if draft.my_team == "red":
            blue_team, red_team = red_team, blue_team
            # We're red, so P(we win) = 1 - P(blue wins)
            flip = True
        else:
            flip = False

        # Check we have at least some known champions
        known = sum(1 for c in blue_team + red_team if c > 0)
        if known < 4:
            return 0.5  # too little info

        try:
            prob = self._model.predict_proba(blue_team, red_team)
            if flip:
                prob = 1.0 - prob
            return prob
        except Exception as e:
            logger.warning("ML prediction error: %s", e)
            return 0.5

    def score(self, candidate_id: int, role: str, draft: DraftState) -> float:
        """Return 0-100 score for the draft engine.

        Maps P(win) to a score:
            P=0.50 → 50 (neutral)
            P=0.55 → 60 (slight edge)
            P=0.60 → 70 (good)
            P=0.45 → 40 (bad)

        Uses 2× scaling so differences are visible:
            score = 50 + (P - 0.5) × 200, clamped to [10, 90]
        """
        p = self.predict_win_probability(candidate_id, role, draft)

        # Linear scaling: P=0.55 → 60, P=0.60 → 70, P=0.45 → 40
        raw = 50.0 + (p - 0.5) * 200.0
        return round(max(10.0, min(90.0, raw)), 1)
