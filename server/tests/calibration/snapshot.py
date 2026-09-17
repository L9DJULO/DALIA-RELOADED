"""Comparaison de deux états du moteur, sur le même cache gelé.

46 des 52 assertions de la suite portent sur un rang. Un rang est une fonction en
escalier : il ne dit rien tant qu'un seuil n'est pas franchi. Mesurée le 17/09/2026,
la vague 1 a déplacé 28 comparaisons sur 38 sans faire bouger un seul compteur — le
changement mordait, la suite était aveugle.

Ce module enregistre le classement complet de chaque cas et le compare à un run
ultérieur, sur trois niveaux : les assertions qui basculent (ce que la suite voit),
les rangs qui changent (ce qu'elle rate hors d'un seuil testé) et les scores qui se
déplacent (ce qu'elle ne voit jamais).
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

# Le moteur arrondit les scores à deux décimales ; en deçà il n'y a rien à voir.
SCORE_EPSILON = 0.005


def assertion_label(assertion: Dict[str, Any]) -> str:
    """Identité stable d'une assertion, pour la retrouver d'un snapshot à l'autre."""
    rest = ",".join(f"{k}={assertion[k]}" for k in sorted(assertion) if k != "type")
    return f"{assertion['type']}({rest})"


def case_entry(recs: Sequence, results: Sequence[Tuple]) -> Dict[str, Any]:
    """Le classement complet d'un cas, pas seulement son top 5 : un déplacement
    peut se produire n'importe où et remonter plus tard."""
    return {
        "ranking": [[r.champion_name, r.total_score, r.score_sd, r.outcome_sd] for r in recs],
        "assertions": [[assertion_label(a), bool(passed)] for a, passed, _ in results],
    }


def build(rank: Optional[str], cache: Optional[Dict[str, Any]], cases: Dict[str, Any]) -> Dict[str, Any]:
    return {"meta": {"created_at": time.time(), "rank": rank, "cache": cache}, "cases": cases}


def write(path: Path, snap: Dict[str, Any]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snap, indent=1, ensure_ascii=False), encoding="utf-8")


def read(path: Path) -> Dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _cache_key(snap: Dict[str, Any]) -> Optional[float]:
    cache = (snap.get("meta") or {}).get("cache")
    return cache.get("frozen_at") if isinstance(cache, dict) else None


def compare(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    """Ce qui a bougé entre deux runs. Refuse de comparer hors d'un cache gelé commun.

    Sans ce refus, l'outil attribuerait au changement de code ce qui n'est qu'une
    dérive des données — le défaut même que le gel du cache corrige.
    """
    diff: Dict[str, Any] = {"cache_mismatch": False, "cases_compared": 0,
                            "assertion_flips": [], "rank_changes": [], "score_moves": []}
    key_before, key_after = _cache_key(before), _cache_key(after)
    if key_before is None or key_after is None or key_before != key_after:
        diff["cache_mismatch"] = True
        return diff

    after_cases = after.get("cases", {})
    for case_id, was in before.get("cases", {}).items():
        now = after_cases.get(case_id)
        if now is None:
            continue
        diff["cases_compared"] += 1
        was_rank = {row[0]: i + 1 for i, row in enumerate(was["ranking"])}
        now_rank = {row[0]: i + 1 for i, row in enumerate(now["ranking"])}
        was_score = {row[0]: row[1] for row in was["ranking"]}
        now_score = {row[0]: row[1] for row in now["ranking"]}
        for name in was_rank.keys() & now_rank.keys():
            if was_rank[name] != now_rank[name]:
                diff["rank_changes"].append((case_id, name, was_rank[name], now_rank[name]))
            if abs(was_score[name] - now_score[name]) >= SCORE_EPSILON:
                diff["score_moves"].append((case_id, name, was_score[name], now_score[name]))
        was_assertions, now_assertions = dict(was.get("assertions", [])), dict(now.get("assertions", []))
        for label in was_assertions.keys() & now_assertions.keys():
            if was_assertions[label] != now_assertions[label]:
                diff["assertion_flips"].append((case_id, label, was_assertions[label], now_assertions[label]))

    for key in ("assertion_flips", "rank_changes", "score_moves"):
        diff[key].sort()
    return diff


def format_report(diff: Dict[str, Any], limit: int = 20) -> str:
    """Du plus fort au plus faible : assertions, rangs, scores."""
    if diff["cache_mismatch"]:
        return ("REFUS : les deux runs ne viennent pas du même cache gelé.\n"
                "  Une comparaison hors d'un gel commun mélange l'effet du code et la dérive\n"
                "  des données. Rejouer les deux runs sur le même snapshot (--freeze-cache).")

    lines = [f"{diff['cases_compared']} cas comparés."]
    flips, ranks, scores = diff["assertion_flips"], diff["rank_changes"], diff["score_moves"]

    lines.append(f"\nAssertions basculées : {len(flips)}")
    for case_id, label, was, now in flips[:limit]:
        sense = "ECHEC -> PASSE" if now else "PASSE -> ECHEC"
        lines.append(f"  {sense}  {case_id} :: {label}")

    lines.append(f"\nChangements de rang : {len(ranks)}")
    for case_id, name, was, now in ranks[:limit]:
        lines.append(f"  {name:20} #{was} -> #{now}   ({case_id})")
    if len(ranks) > limit:
        lines.append(f"  … et {len(ranks) - limit} autres")

    lines.append(f"\nDéplacements de score : {len(scores)}")
    for case_id, name, was, now in scores[:limit]:
        lines.append(f"  {name:20} {was:+.2f} -> {now:+.2f}  ({now - was:+.2f})   ({case_id})")
    if len(scores) > limit:
        lines.append(f"  … et {len(scores) - limit} autres")

    if not (flips or ranks or scores):
        lines.append("\nAucun mouvement : les deux états du moteur sont identiques.")
    return "\n".join(lines)
