"""Gel du cache de calibration.

Sans gel, l'effet d'une vague de scoring est indiscernable de la dérive des données.
Constaté le 15/09/2026 : les compteurs de triage sont passés de 20/10/8/14 à 21/9/8/14
sans une ligne de code changée — le TTL de six heures avait expiré et Lolalytics avait
resservi des statistiques fraîches au milieu d'une mesure.

Le snapshot est une **copie** du cache vivant, pas un gel sur place : le cache vivant
est réécrit dès que l'application tourne.
"""
from __future__ import annotations

import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

MANIFEST = "MANIFEST.json"


@dataclass(frozen=True)
class CacheMode:
    """Comment la calibration doit lire ses données pour ce run."""

    cache_dir: Optional[str]
    cache_ttl_hours: Optional[int]
    offline: bool
    manifest: Optional[Dict[str, Any]] = None

    def fetcher_kwargs(self) -> Dict[str, Any]:
        if not self.offline:
            return {}  # cache vivant : le fetcher prend ses valeurs de config
        return {"cache_dir": self.cache_dir, "cache_ttl_hours": None, "offline": True}

    def banner(self) -> str:
        if not self.offline:
            return "Cache VIVANT — les données peuvent dériver d'un run à l'autre."
        frozen_at = time.strftime("%d/%m/%Y %H:%M", time.localtime(self.manifest["frozen_at"]))
        return (f"Cache GELÉ — snapshot du {frozen_at}, {self.manifest['entries']} entrées, "
                f"tier {self.manifest.get('tier') or '?'}.")


def freeze(live: Path, frozen: Path, ddragon_version: str = "", tier: str = "") -> Dict[str, Any]:
    """Copie le cache vivant dans `frozen` et écrit le manifeste. Renvoie le manifeste."""
    live, frozen = Path(live), Path(frozen)
    frozen.mkdir(parents=True, exist_ok=True)
    entries = 0
    for entry in live.glob("*.json"):
        if entry.name == MANIFEST:
            continue
        shutil.copy2(entry, frozen / entry.name)
        entries += 1
    manifest = {"frozen_at": time.time(), "entries": entries, "source": str(live),
                "ddragon_version": ddragon_version, "tier": tier}
    (frozen / MANIFEST).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def load_manifest(frozen: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads((Path(frozen) / MANIFEST).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def resolve(frozen: Path, live: bool = False) -> CacheMode:
    """Choisit le mode du run. Le gel est le défaut dès qu'un snapshot existe.

    Il faut demander (`--live-cache`) pour en sortir, jamais pour y entrer : une mesure
    faite par inadvertance sur des données mouvantes est exactement le défaut du 15/09.
    """
    manifest = None if live else load_manifest(frozen)
    if manifest is None:
        return CacheMode(cache_dir=None, cache_ttl_hours=None, offline=False)
    return CacheMode(str(frozen), None, True, manifest)
