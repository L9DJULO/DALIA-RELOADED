"""DALIA Draft Prediction Model — PyTorch neural network.

Architecture:
    - Champion embeddings (each champion → learned 32-dim vector)
    - Role-aware: separate embedding lookup per role
    - Matchup interactions: dot products between opposing roles
    - Team aggregation + MLP → P(blue team wins)

Input:  10 champion IDs (5 blue + 5 red, in role order: top/jg/mid/bot/sup)
Output: probability that blue team wins (0.0 to 1.0)
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional, Tuple

import torch
import torch.nn as nn
from torch.utils.data import Dataset

logger = logging.getLogger("dalia.ml.model")

ROLE_ORDER = ["top", "jg", "mid", "bot", "sup"]
NUM_CHAMPIONS = 1100  # Riot champion IDs go up to ~900+; room for future champs


class DraftDataset(Dataset):
    """Load matches from JSONL and produce tensors for training."""

    def __init__(self, jsonl_path: str, augment: bool = True):
        """
        Args:
            jsonl_path: path to matches.jsonl
            augment: if True, include team-swapped version (doubles data, ensures symmetry)
        """
        self.samples: List[Tuple[List[int], List[int], float]] = []

        path = Path(jsonl_path)
        if not path.exists():
            raise FileNotFoundError(f"No match data at {jsonl_path}")

        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                m = json.loads(line)

                blue = [
                    m.get("blue_top", 0), m.get("blue_jg", 0), m.get("blue_mid", 0),
                    m.get("blue_bot", 0), m.get("blue_sup", 0),
                ]
                red = [
                    m.get("red_top", 0), m.get("red_jg", 0), m.get("red_mid", 0),
                    m.get("red_bot", 0), m.get("red_sup", 0),
                ]
                blue_win = float(m.get("blue_win", 0))

                # Skip if any champion ID is 0 or out of range
                if any(c <= 0 or c >= NUM_CHAMPIONS for c in blue + red):
                    continue

                self.samples.append((blue, red, blue_win))

                # Augment: swap teams → label flips
                if augment:
                    self.samples.append((red, blue, 1.0 - blue_win))

        logger.info("Loaded %d samples from %s (augment=%s)", len(self.samples), jsonl_path, augment)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        blue, red, label = self.samples[idx]
        return (
            torch.tensor(blue, dtype=torch.long),
            torch.tensor(red, dtype=torch.long),
            torch.tensor(label, dtype=torch.float32),
        )


class DraftNet(nn.Module):
    """Draft prediction network with champion embeddings and matchup interactions.

    Architecture:
        1. Shared champion embedding (32-dim)
        2. Role-specific projections (learn that "Fiora top" ≠ "Fiora mid")
        3. Matchup interactions: dot product of each (blue_role_i, red_role_j)
           → captures cross-role threats (assassin jg vs ADC bot)
        4. Concat team features + interactions → MLP → P(blue wins)
    """

    def __init__(
        self,
        num_champions: int = NUM_CHAMPIONS,
        embed_dim: int = 32,
        hidden_dim: int = 256,
        dropout: float = 0.3,
    ):
        super().__init__()

        self.embed_dim = embed_dim
        self.champion_embed = nn.Embedding(num_champions, embed_dim, padding_idx=0)

        # Role-specific projections (5 roles)
        self.role_proj = nn.ModuleList([
            nn.Linear(embed_dim, embed_dim) for _ in range(5)
        ])

        # Feature sizes:
        #   Team features: 2 teams × 5 roles × embed_dim = 10 * embed_dim
        #   Matchup interactions: 5 × 5 = 25 dot products
        #   Side feature: 1 (bias term for blue side advantage)
        input_size = 10 * embed_dim + 25 + 1

        self.mlp = nn.Sequential(
            nn.Linear(input_size, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.LayerNorm(hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout * 0.7),
            nn.Linear(hidden_dim // 2, hidden_dim // 4),
            nn.ReLU(),
            nn.Dropout(dropout * 0.5),
            nn.Linear(hidden_dim // 4, 1),
        )

        self._init_weights()

    def _init_weights(self):
        """Xavier init for linear layers, normal for embeddings."""
        nn.init.normal_(self.champion_embed.weight, mean=0.0, std=0.05)
        for m in self.mlp:
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                nn.init.zeros_(m.bias)
        for proj in self.role_proj:
            nn.init.xavier_uniform_(proj.weight)
            nn.init.zeros_(proj.bias)

    def _embed_team(self, champ_ids: torch.Tensor) -> torch.Tensor:
        """Embed a team: (batch, 5) → (batch, 5, embed_dim) with role projections."""
        raw = self.champion_embed(champ_ids)  # (batch, 5, embed_dim)
        projected = []
        for i in range(5):
            projected.append(self.role_proj[i](raw[:, i, :]))  # (batch, embed_dim)
        return torch.stack(projected, dim=1)  # (batch, 5, embed_dim)

    def forward(self, blue_champs: torch.Tensor, red_champs: torch.Tensor) -> torch.Tensor:
        """
        Args:
            blue_champs: (batch, 5) — champion IDs for [top, jg, mid, bot, sup]
            red_champs:  (batch, 5)

        Returns: (batch, 1) — logits (pass through sigmoid for probabilities)
        """
        blue_emb = self._embed_team(blue_champs)  # (batch, 5, embed_dim)
        red_emb = self._embed_team(red_champs)     # (batch, 5, embed_dim)

        # Flatten team features
        blue_flat = blue_emb.reshape(blue_emb.size(0), -1)  # (batch, 5*embed_dim)
        red_flat = red_emb.reshape(red_emb.size(0), -1)     # (batch, 5*embed_dim)

        # Matchup interactions: dot product of every (blue_role_i, red_role_j)
        # → captures cross-role dynamics (e.g., blue jungle vs red bot)
        interactions = torch.bmm(blue_emb, red_emb.transpose(1, 2))  # (batch, 5, 5)
        interactions_flat = interactions.reshape(interactions.size(0), -1)  # (batch, 25)

        # Side bias (blue side has a small advantage in pro play)
        side_bias = torch.ones(blue_champs.size(0), 1, device=blue_champs.device)

        # Concat all features
        x = torch.cat([blue_flat, red_flat, interactions_flat, side_bias], dim=1)

        return self.mlp(x)  # (batch, 1) — logits

    def predict_proba(self, blue_ids: List[int], red_ids: List[int]) -> float:
        """Convenience: predict P(blue wins) from champion ID lists.

        Args:
            blue_ids: [top, jg, mid, bot, sup] champion IDs
            red_ids:  [top, jg, mid, bot, sup] champion IDs

        Returns: float in [0, 1]
        """
        self.eval()
        with torch.no_grad():
            blue_t = torch.tensor([blue_ids], dtype=torch.long)
            red_t = torch.tensor([red_ids], dtype=torch.long)
            logit = self.forward(blue_t, red_t)
            return torch.sigmoid(logit).item()
