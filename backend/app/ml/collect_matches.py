#!/usr/bin/env python3
"""Riot API Match Data Collector for DALIA ML.

Collects D2+ ranked matches (last 30 days) for training a draft prediction model.

Usage:
    cd backend
    python -m app.ml.collect_matches --api-key RGAPI-xxx --target 15000

Flow:
    1. Fetch D2+ player list (D2, D1, Master, GM, Challenger)
    2. Get PUUID for each player via summoner-v4
    3. Get ranked match IDs (last 30 days)
    4. Deduplicate match IDs
    5. Fetch match details
    6. Extract team compositions + outcome
    7. Save to JSONL (incremental, resumable)

Rate limiting:
    Development key: 20 req/s, 100 req/2min.
    Bottleneck is 100/2min = ~0.83 req/s.
    ~15K matches ≈ 5-6 hours to collect.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("dalia.collect")

# ── Region mapping ───────────────────────────────────────────────────────
PLATFORM_TO_REGIONAL = {
    "euw1": "europe", "eun1": "europe", "tr1": "europe", "ru": "europe",
    "na1": "americas", "br1": "americas", "la1": "americas", "la2": "americas",
    "kr": "asia", "jp1": "asia",
    "oc1": "sea", "ph2": "sea", "sg2": "sea", "th2": "sea", "tw2": "sea", "vn2": "sea",
}

# Role order: how we store champion positions in training data
ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]
ROLE_KEYS = ["top", "jg", "mid", "bot", "sup"]


# ── Rate limiter ─────────────────────────────────────────────────────────
class RateLimiter:
    """Token-bucket rate limiter for Riot API development keys."""

    def __init__(self, short_limit: int = 20, short_window: float = 1.0,
                 long_limit: int = 100, long_window: float = 121.0):
        self.short_limit = short_limit
        self.short_window = short_window
        self.long_limit = long_limit
        self.long_window = long_window
        self._short_times: deque = deque()
        self._long_times: deque = deque()

    def wait(self):
        """Block until we can make a request without exceeding limits."""
        now = time.time()

        # Purge old timestamps
        while self._short_times and now - self._short_times[0] > self.short_window:
            self._short_times.popleft()
        while self._long_times and now - self._long_times[0] > self.long_window:
            self._long_times.popleft()

        # Wait for short window
        if len(self._short_times) >= self.short_limit:
            wait = self.short_window - (now - self._short_times[0]) + 0.05
            if wait > 0:
                time.sleep(wait)

        # Wait for long window
        now = time.time()
        while self._long_times and now - self._long_times[0] > self.long_window:
            self._long_times.popleft()

        if len(self._long_times) >= self.long_limit:
            wait = self.long_window - (now - self._long_times[0]) + 0.1
            if wait > 0:
                logger.info("Rate limit — sleeping %.1fs…", wait)
                time.sleep(wait)

        now = time.time()
        self._short_times.append(now)
        self._long_times.append(now)


# ── Riot API Client ──────────────────────────────────────────────────────
class RiotClient:
    """Synchronous Riot API client with rate limiting and retry."""

    def __init__(self, api_key: str, platform: str = "euw1"):
        self.api_key = api_key
        self.platform = platform.lower()
        self.regional = PLATFORM_TO_REGIONAL.get(self.platform, "europe")
        self.limiter = RateLimiter()
        self._client = httpx.Client(
            timeout=30.0,
            headers={"X-Riot-Token": api_key},
            follow_redirects=True,
        )
        self._request_count = 0

    def close(self):
        self._client.close()

    def _get(self, base: str, path: str, params: dict = None) -> Any:
        """Make a rate-limited GET request with retry on 429."""
        url = f"https://{base}.api.riotgames.com{path}"
        for attempt in range(5):
            self.limiter.wait()
            try:
                resp = self._client.get(url, params=params)
                self._request_count += 1

                if resp.status_code == 200:
                    return resp.json()
                elif resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 10))
                    logger.warning("429 Rate Limited — retrying in %ds (attempt %d)", retry_after, attempt + 1)
                    time.sleep(retry_after + 1)
                    continue
                elif resp.status_code == 404:
                    return None
                elif resp.status_code == 403:
                    logger.error("403 Forbidden — API key expired or invalid")
                    raise SystemExit("API key expired!")
                else:
                    logger.warning("HTTP %d for %s (attempt %d)", resp.status_code, path, attempt + 1)
                    time.sleep(2 ** attempt)
            except httpx.TimeoutException:
                logger.warning("Timeout for %s (attempt %d)", path, attempt + 1)
                time.sleep(2 ** attempt)
            except SystemExit:
                raise
            except Exception as e:
                logger.warning("Request error: %s (attempt %d)", e, attempt + 1)
                time.sleep(2 ** attempt)
        return None

    def _platform_get(self, path: str, params: dict = None) -> Any:
        return self._get(self.platform, path, params)

    def _regional_get(self, path: str, params: dict = None) -> Any:
        return self._get(self.regional, path, params)

    # ── League endpoints ──
    def get_league_entries(self, tier: str, division: str, page: int = 1) -> List[Dict]:
        """Get league entries for a tier/division page."""
        data = self._platform_get(
            f"/lol/league/v4/entries/RANKED_SOLO_5x5/{tier}/{division}",
            {"page": page},
        )
        return data if isinstance(data, list) else []

    def get_apex_league(self, tier: str) -> List[Dict]:
        """Get Master/GM/Challenger league entries."""
        endpoint_map = {
            "MASTER": "/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5",
            "GRANDMASTER": "/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5",
            "CHALLENGER": "/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5",
        }
        path = endpoint_map.get(tier.upper())
        if not path:
            return []
        data = self._platform_get(path)
        if data and "entries" in data:
            return data["entries"]
        return []

    # ── Summoner endpoint ──
    def get_puuid(self, summoner_id: str) -> Optional[str]:
        """Get PUUID from encrypted summoner ID."""
        data = self._platform_get(f"/lol/summoner/v4/summoners/{summoner_id}")
        if data:
            return data.get("puuid")
        return None

    # ── Match endpoints ──
    def get_match_ids(self, puuid: str, start_time: int, count: int = 100) -> List[str]:
        """Get ranked match IDs for a player since start_time (epoch seconds)."""
        data = self._regional_get(
            f"/lol/match/v5/matches/by-puuid/{puuid}/ids",
            {"queue": 420, "type": "ranked", "start": 0, "count": count, "startTime": start_time},
        )
        return data if isinstance(data, list) else []

    def get_match(self, match_id: str) -> Optional[Dict]:
        """Get full match details."""
        return self._regional_get(f"/lol/match/v5/matches/{match_id}")


# ── Match data extraction ────────────────────────────────────────────────
def extract_draft(match_data: Dict) -> Optional[Dict]:
    """Extract team compositions from Riot match data.

    Returns dict with:
        blue_top, blue_jg, blue_mid, blue_bot, blue_sup: champion IDs
        red_top, red_jg, red_mid, red_bot, red_sup: champion IDs
        blue_win: 1 if blue won, 0 if red won
        duration: game duration in seconds
        patch: game version string
    """
    info = match_data.get("info", {})

    # Skip remakes (< 5 min)
    duration = info.get("gameDuration", 0)
    if duration < 300:
        return None

    # Skip non-5v5
    participants = info.get("participants", [])
    if len(participants) != 10:
        return None

    # Separate teams
    blue_team = {}  # role → champion_id
    red_team = {}
    for p in participants:
        team_id = p.get("teamId", 0)
        role = p.get("teamPosition", "").upper()
        champ_id = p.get("championId", 0)

        if role not in ROLE_ORDER or champ_id == 0:
            return None  # invalid role assignment

        if team_id == 100:
            blue_team[role] = champ_id
        elif team_id == 200:
            red_team[role] = champ_id

    # Verify all 5 roles are present for both teams
    if len(blue_team) != 5 or len(red_team) != 5:
        return None

    # Determine winner
    teams_info = info.get("teams", [])
    blue_win = None
    for t in teams_info:
        if t.get("teamId") == 100:
            blue_win = 1 if t.get("win") else 0
            break
    if blue_win is None:
        return None

    result = {"blue_win": blue_win, "duration": duration}

    # Add champion IDs in role order
    for role, key in zip(ROLE_ORDER, ROLE_KEYS):
        result[f"blue_{key}"] = blue_team[role]
        result[f"red_{key}"] = red_team[role]

    # Patch
    game_version = info.get("gameVersion", "")
    parts = game_version.split(".")
    if len(parts) >= 2:
        result["patch"] = f"{parts[0]}.{parts[1]}"

    return result


# ── Checkpoint management ────────────────────────────────────────────────
class Checkpoint:
    """Manages progress files so collection can resume after interruption."""

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        output_dir.mkdir(parents=True, exist_ok=True)

        self.players_file = output_dir / "players.json"
        self.match_ids_file = output_dir / "match_ids.json"
        self.matches_file = output_dir / "matches.jsonl"
        self.progress_file = output_dir / "progress.json"

    def load_players(self) -> List[Dict]:
        if self.players_file.exists():
            return json.loads(self.players_file.read_text())
        return []

    def save_players(self, players: List[Dict]):
        self.players_file.write_text(json.dumps(players))

    def load_match_ids(self) -> List[str]:
        if self.match_ids_file.exists():
            return json.loads(self.match_ids_file.read_text())
        return []

    def save_match_ids(self, match_ids: List[str]):
        self.match_ids_file.write_text(json.dumps(match_ids))

    def load_progress(self) -> Set[str]:
        if self.progress_file.exists():
            return set(json.loads(self.progress_file.read_text()))
        return set()

    def save_progress(self, done: Set[str]):
        self.progress_file.write_text(json.dumps(list(done)))

    def append_match(self, draft: Dict):
        with open(self.matches_file, "a") as f:
            f.write(json.dumps(draft) + "\n")

    def count_matches(self) -> int:
        if not self.matches_file.exists():
            return 0
        with open(self.matches_file) as f:
            return sum(1 for _ in f)


# ── Main collection pipeline ────────────────────────────────────────────
def collect_players(client: RiotClient, max_players: int = 800) -> List[Dict]:
    """Collect D2+ player summoner IDs."""
    logger.info("=== Phase 1: Collecting D2+ player list ===")

    entries = []

    # Apex leagues (small, get all)
    for tier in ["CHALLENGER", "GRANDMASTER", "MASTER"]:
        data = client.get_apex_league(tier)
        logger.info("  %s: %d players", tier, len(data))
        for e in data:
            entries.append({"summonerId": e["summonerId"], "tier": tier})

    # Diamond I & II (paginated)
    for division in ["I", "II"]:
        page = 1
        while True:
            data = client.get_league_entries("DIAMOND", division, page)
            if not data:
                break
            for e in data:
                entries.append({"summonerId": e["summonerId"], "tier": f"DIAMOND_{division}"})
            logger.info("  DIAMOND %s page %d: %d players", division, page, len(data))
            page += 1
            if len(data) < 205:  # page is full at 205
                break

    logger.info("Total D2+ players found: %d", len(entries))

    # Shuffle and limit
    random.shuffle(entries)
    entries = entries[:max_players]

    return entries


def resolve_puuids(client: RiotClient, players: List[Dict], checkpoint: Checkpoint) -> List[Dict]:
    """Resolve summoner IDs to PUUIDs."""
    logger.info("=== Phase 2: Resolving PUUIDs (%d players) ===", len(players))

    resolved = 0
    for i, p in enumerate(players):
        if "puuid" in p:
            resolved += 1
            continue

        puuid = client.get_puuid(p["summonerId"])
        if puuid:
            p["puuid"] = puuid
            resolved += 1
        else:
            p["puuid"] = None

        if (i + 1) % 50 == 0:
            logger.info("  PUUIDs resolved: %d/%d", resolved, len(players))
            checkpoint.save_players(players)

    checkpoint.save_players(players)
    players = [p for p in players if p.get("puuid")]
    logger.info("Players with PUUIDs: %d", len(players))
    return players


def collect_match_ids(client: RiotClient, players: List[Dict], checkpoint: Checkpoint) -> List[str]:
    """Get match IDs from player match histories."""
    logger.info("=== Phase 3: Collecting match IDs ===")

    # 30 days ago in epoch seconds
    start_time = int(time.time()) - 30 * 24 * 3600

    all_ids: Set[str] = set()

    for i, p in enumerate(players):
        puuid = p.get("puuid")
        if not puuid:
            continue

        ids = client.get_match_ids(puuid, start_time)
        all_ids.update(ids)

        if (i + 1) % 25 == 0:
            logger.info("  Players scanned: %d/%d — unique matches: %d",
                        i + 1, len(players), len(all_ids))

    match_list = list(all_ids)
    random.shuffle(match_list)
    checkpoint.save_match_ids(match_list)
    logger.info("Total unique match IDs: %d", len(match_list))
    return match_list


def collect_matches(
    client: RiotClient,
    match_ids: List[str],
    checkpoint: Checkpoint,
    target: int,
) -> int:
    """Fetch match details and extract drafts."""
    logger.info("=== Phase 4: Fetching match details (target=%d) ===", target)

    done = checkpoint.load_progress()
    collected = checkpoint.count_matches()
    skipped = 0
    errors = 0

    logger.info("Resuming: %d already collected, %d processed", collected, len(done))

    for i, mid in enumerate(match_ids):
        if collected >= target:
            logger.info("Target reached: %d matches!", target)
            break

        if mid in done:
            continue

        match_data = client.get_match(mid)
        done.add(mid)

        if match_data is None:
            errors += 1
            continue

        draft = extract_draft(match_data)
        if draft is None:
            skipped += 1
            continue

        draft["match_id"] = mid
        checkpoint.append_match(draft)
        collected += 1

        if collected % 100 == 0:
            checkpoint.save_progress(done)
            eta_min = (target - collected) * 1.25 / 60  # ~1.25s per request avg
            logger.info(
                "  Collected: %d/%d  (skipped=%d, errors=%d, API calls=%d, ETA=%.0fmin)",
                collected, target, skipped, errors, client._request_count, eta_min,
            )

    checkpoint.save_progress(done)
    logger.info("=== Collection complete: %d matches ===", collected)
    return collected


# ── CLI ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Collect D2+ ranked matches for DALIA ML")
    parser.add_argument("--api-key", required=True, help="Riot API key (RGAPI-xxx)")
    parser.add_argument("--platform", default="euw1", help="Platform (euw1, na1, kr, …)")
    parser.add_argument("--target", type=int, default=15000, help="Target number of matches")
    parser.add_argument("--max-players", type=int, default=800, help="Max players to scan")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent.parent / "data" / "matches"),
        help="Output directory",
    )
    args = parser.parse_args()

    output_dir = Path(args.output)
    checkpoint = Checkpoint(output_dir)
    client = RiotClient(args.api_key, args.platform)

    try:
        # Phase 1: Players
        players = checkpoint.load_players()
        if not players:
            players = collect_players(client, args.max_players)
            checkpoint.save_players(players)
        else:
            logger.info("Loaded %d players from checkpoint", len(players))

        # Phase 2: PUUIDs
        needs_puuid = sum(1 for p in players if "puuid" not in p)
        if needs_puuid > 0:
            players = resolve_puuids(client, players, checkpoint)
        else:
            players = [p for p in players if p.get("puuid")]
            logger.info("All %d players already have PUUIDs", len(players))

        # Phase 3: Match IDs
        match_ids = checkpoint.load_match_ids()
        if not match_ids:
            match_ids = collect_match_ids(client, players, checkpoint)
        else:
            logger.info("Loaded %d match IDs from checkpoint", len(match_ids))

        # Phase 4: Match details
        current = checkpoint.count_matches()
        if current < args.target:
            collect_matches(client, match_ids, checkpoint, args.target)
        else:
            logger.info("Already have %d matches (target=%d)", current, args.target)

    except KeyboardInterrupt:
        logger.info("\nInterrupted! Progress saved — rerun to resume.")
    except SystemExit as e:
        logger.error(str(e))
    finally:
        client.close()

    logger.info("Total matches: %d — saved to %s", checkpoint.count_matches(), checkpoint.matches_file)


if __name__ == "__main__":
    main()
