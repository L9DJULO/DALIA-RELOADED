#!/usr/bin/env python
"""Stats par joueur des parties pros, pour la note teamfight (chantier 14).

LCK, LPL, LEC, LCS 2026, patches antérieurs à 26.16 : la concordance mesure
le moteur sur 26.16-26.18, la note ne doit pas venir des mêmes parties.
Identifiants : $FANDOM_USERNAME / $FANDOM_BOT_PASSWORD, comme scraper.py.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "scripts"))

import scraper  # noqa: E402
from derive_ratings import match_champion, _get_json  # noqa: E402

OUT = HERE.parents[1] / "app" / "data" / "pro_player_stats.json"
LAST_PATCH = (26, 16)


def _patch_tuple(p):
    try:
        major, minor = str(p).split(".")[:2]
        return int(major), int(minor)
    except ValueError:
        return None


def main() -> int:
    user, password = scraper.credentials_from_env()
    if not user or not password:
        print("Identifiants Fandom absents : définir FANDOM_USERNAME et FANDOM_BOT_PASSWORD.", file=sys.stderr)
        return 1
    with httpx.Client(headers={"User-Agent": scraper.USER_AGENT}, follow_redirects=True) as client:
        scraper.login(client, user, password)
        leagues = " OR ".join(f"SG.OverviewPage LIKE '%{lg}%'" for lg in scraper.LEAGUES_TO_SCRAPE)
        rows, complete = scraper._cargo_query(
            client, table="ScoreboardPlayers=SP,ScoreboardGames=SG", join_on="SP.GameId=SG.GameId",
            fields="SP.Champion=Champion,SP.IngameRole=Role,SP.Kills=Kills,SP.Assists=Assists,"
                   "SP.TeamKills=TeamKills,SP.DamageToChampions=Damage,SG.Patch=Patch,SP.GameId=GameId",
            where=f"({leagues}) AND SG.DateTime_UTC >= '2026-01-01 00:00:00'",
            order_by="SG.DateTime_UTC")
        version = _get_json(client, "https://ddragon.leagueoflegends.com/api/versions.json")[0]
        ddragon = _get_json(client, f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json")["data"]
    out, unmatched = [], set()
    for r in rows:
        patch = _patch_tuple(r.get("Patch"))
        role = scraper._normalize_role(r.get("Role"))
        key = match_champion(r.get("Champion") or "", ddragon)
        if patch is None or patch >= LAST_PATCH or role is None:
            continue
        if key is None:
            unmatched.add(r.get("Champion"))
            continue
        out.append({"champion": key, "role": role, "kills": int(r.get("Kills") or 0),
                    "assists": int(r.get("Assists") or 0), "team_kills": int(r.get("TeamKills") or 0),
                    "damage": int(r.get("Damage") or 0), "patch": r.get("Patch")})
    OUT.write_text(json.dumps({"_meta": {"complete": complete, "unmatched": sorted(unmatched), "rows": len(out)},
                               "rows": out}, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(out)} lignes écrites ({'complet' if complete else 'INCOMPLET'}) ; sans correspondance : {sorted(unmatched)}")
    return 0 if complete else 2


if __name__ == "__main__":
    sys.exit(main())
