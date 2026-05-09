#!/usr/bin/env python
"""DALIA — Pro draft scraper (Leaguepedia Cargo API).

Pulls real pro drafts (picks, bans, roles, winner, patch) from the Leaguepedia
public MediaWiki Cargo API and dumps them as JSON for downstream consumption
by generate_test_cases.py.

Why Leaguepedia + Cargo:
  • Public, stable, documented MediaWiki API — no scraping HTML.
  • Cargo tables are the structured backbone of the wiki; same data the wiki
    uses to render its own pages.
  • Free, no auth required.

Tables queried:
  • ScoreboardGames   — game-level metadata (patch, teams, winner, datetime)
  • PicksAndBansS7    — picks/bans + per-pick role for each team

We intersect the two on Tournament + N_GameInMatch to attach patch + winner
to each draft. Output: pro_drafts.json next to this script.

Usage:
  python scraper.py
  python scraper.py --leagues LEC,LCK --max-games 50
  python scraper.py --since 2026-02-01 --patches 26.7,26.8
  python scraper.py --resume   # pick up where the previous run stopped
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger("dalia.pro_scraper")

# ─── Configuration ────────────────────────────────────────────────────────
API_URL = "https://lol.fandom.com/api.php"
# Fandom asks for a descriptive UA on programmatic API access. An identifiable
# UA (project + contact) is rate-limited far less aggressively than a generic
# one. Keep this honest — it's a public good.
USER_AGENT = (
    "DALIA-Calibration/1.0 "
    "(+https://github.com/dalia-reloaded/dalia; jules.lange@hotmail.fr)"
)

# Leaguepedia's "League" filter values for ScoreboardGames.
# The wiki uses "League" (full name) — short names work via OverviewPage matching.
LEAGUES_TO_SCRAPE = ["LEC", "LCK", "LCS", "LPL"]

# Politeness: seconds between API calls. Fandom's MediaWiki host rate-limits
# anonymous clients aggressively (~1 req/s sustained); 2.0s gives us headroom.
REQUEST_DELAY_S = 2.0

# Retry policy for transient failures (rate limits, timeouts).
MAX_RETRIES = 8
# Exponential backoff schedule, used when no Retry-After header is given.
RETRY_BACKOFF_SCHEDULE_S: Tuple[float, ...] = (60.0, 120.0, 240.0, 480.0, 960.0, 960.0, 960.0, 960.0)
# Cap on a single backoff (covers absurd Retry-After values from upstream).
MAX_BACKOFF_S = 1800.0

# Cargo API caps results at 500/query. We page with offset.
PAGE_LIMIT = 500

# Default lookback when --since is not given.
DEFAULT_LOOKBACK_DAYS = 90

CACHE_DIR = Path(__file__).resolve().parent / "cache"
OUTPUT_PATH = Path(__file__).resolve().parent / "pro_drafts.json"
STATE_PATH = Path(__file__).resolve().parent / "scrape_state.json"

# Standard pro draft sequence (LCS/LEC/LCK/LPL competitive).
GLOBAL_PICK_ORDER: List[Tuple[str, int]] = [
    ("blue", 1), ("red", 1), ("red", 2), ("blue", 2), ("blue", 3),
    ("red", 3), ("red", 4), ("blue", 4), ("blue", 5), ("red", 5),
]

ROLE_NORMALIZE = {
    "top": "top",
    "jungle": "jungle", "jng": "jungle", "jg": "jungle",
    "mid": "mid", "middle": "mid",
    "bot": "bot", "bottom": "bot", "adc": "bot",
    "support": "support", "sup": "support", "supp": "support",
}


# ─── Resume state ─────────────────────────────────────────────────────────
def _empty_state() -> Dict[str, Any]:
    return {
        "scoreboard_done": False,
        "processed_tournaments": [],
        # Legacy field, kept for backward-compat with older state files.
        "processed_game_ids": [],
    }


def _load_state() -> Dict[str, Any]:
    if not STATE_PATH.exists():
        return _empty_state()
    try:
        loaded = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        # Forward-fill missing fields when reading old state files.
        merged = _empty_state()
        merged.update(loaded if isinstance(loaded, dict) else {})
        return merged
    except Exception as exc:
        logger.warning("State file unreadable (%s) — starting fresh", exc)
        return _empty_state()


def _save_state(state: Dict[str, Any]) -> None:
    try:
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("Could not persist state: %s", exc)


def _clear_state() -> None:
    if STATE_PATH.exists():
        STATE_PATH.unlink()


# ─── HTTP helpers ─────────────────────────────────────────────────────────
def _cache_key(table: str, where: str, fields: str, offset: int) -> str:
    raw = f"{table}|{where}|{fields}|{offset}"
    # Stable hash: Python's built-in hash() is randomized per process, so
    # caches written in one run would never match in the next.
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"{table}__{digest}.json"


def _read_cache(name: str) -> Optional[List[Dict[str, Any]]]:
    p = CACHE_DIR / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Cache read failed for %s: %s", name, exc)
        return None


def _write_cache(name: str, payload: List[Dict[str, Any]]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _backoff_for(attempt: int, retry_after: Optional[float]) -> float:
    """Pick a sleep duration. Retry-After header wins if present."""
    if retry_after is not None and retry_after > 0:
        return min(retry_after, MAX_BACKOFF_S)
    idx = min(attempt, len(RETRY_BACKOFF_SCHEDULE_S) - 1)
    return RETRY_BACKOFF_SCHEDULE_S[idx]


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    """Retry-After can be 'delta-seconds' or an HTTP-date. We accept both."""
    if not value:
        return None
    value = value.strip()
    try:
        return float(value)
    except ValueError:
        pass
    # HTTP-date form (RFC 7231) — best-effort; if parsing fails, skip.
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(value)
        if dt is None:
            return None
        delta = (dt - datetime.now(timezone.utc)).total_seconds()
        return max(delta, 0.0)
    except Exception:
        return None


def _is_ratelimited(data: Any) -> Tuple[bool, Optional[str]]:
    """Detect Leaguepedia rate-limit signals in a 200-OK JSON body.

    Returns (limited, info_string).
    """
    if not isinstance(data, dict):
        return False, None
    err = data.get("error")
    if isinstance(err, dict) and err.get("code") == "ratelimited":
        return True, err.get("info")
    warnings = data.get("warnings")
    if isinstance(warnings, dict):
        # Some MediaWiki installs surface rate-limit info under warnings.
        for key, payload in warnings.items():
            if isinstance(payload, dict):
                blob = " ".join(str(v) for v in payload.values()).lower()
                if "ratelimit" in blob or "rate-limit" in blob or "rate limit" in blob:
                    return True, f"warnings.{key}: {payload}"
            elif isinstance(payload, str) and "ratelimit" in payload.lower():
                return True, f"warnings.{key}: {payload}"
    return False, None


def _cargo_query(
    client: httpx.Client,
    *,
    table: str,
    fields: str,
    where: str,
    order_by: str = "",
    use_cache: bool = True,
) -> Tuple[List[Dict[str, Any]], bool]:
    """Run a paged Cargo query.

    Returns (rows, complete). `complete` is False if we gave up on a page mid-way
    — the caller can then decide whether to keep what was already collected or
    bail out entirely.
    """
    rows: List[Dict[str, Any]] = []
    offset = 0
    complete = True
    while True:
        cache_name = _cache_key(table, where, fields, offset)
        cached = _read_cache(cache_name) if use_cache else None
        if cached is not None:
            page = cached
        else:
            params = {
                "action": "cargoquery",
                "format": "json",
                "tables": table,
                "fields": fields,
                "where": where,
                "limit": str(PAGE_LIMIT),
                "offset": str(offset),
            }
            if order_by:
                params["order_by"] = order_by

            page = None
            for attempt in range(MAX_RETRIES):
                time.sleep(REQUEST_DELAY_S)
                retry_after: Optional[float] = None
                try:
                    r = client.get(API_URL, params=params, timeout=30.0)
                except httpx.HTTPError as exc:
                    logger.warning(
                        "Cargo network error (%s offset=%d, attempt %d/%d): %s",
                        table, offset, attempt + 1, MAX_RETRIES, exc,
                    )
                    sleep_s = _backoff_for(attempt, None)
                    logger.warning("  → backing off %.0fs", sleep_s)
                    time.sleep(sleep_s)
                    continue

                # HTTP 429 — rate-limited at the transport layer.
                if r.status_code == 429:
                    retry_after = _parse_retry_after(r.headers.get("Retry-After"))
                    sleep_s = _backoff_for(attempt, retry_after)
                    logger.warning(
                        "Cargo HTTP 429 (attempt %d/%d) — Retry-After=%s, sleeping %.0fs",
                        attempt + 1, MAX_RETRIES, r.headers.get("Retry-After", "—"), sleep_s,
                    )
                    time.sleep(sleep_s)
                    continue

                # Other HTTP errors.
                if r.status_code >= 500 or r.status_code in (408, 503):
                    sleep_s = _backoff_for(attempt, None)
                    logger.warning(
                        "Cargo HTTP %d (attempt %d/%d) — sleeping %.0fs",
                        r.status_code, attempt + 1, MAX_RETRIES, sleep_s,
                    )
                    time.sleep(sleep_s)
                    continue

                if r.status_code >= 400:
                    logger.error(
                        "Cargo HTTP %d (non-retryable) — body: %r",
                        r.status_code, r.text[:160],
                    )
                    page = []
                    break

                try:
                    data = r.json()
                except ValueError:
                    sleep_s = _backoff_for(attempt, None)
                    logger.warning(
                        "Cargo non-JSON response (truncated?): %r — sleeping %.0fs",
                        r.text[:120], sleep_s,
                    )
                    time.sleep(sleep_s)
                    continue

                # MediaWiki errors come as `{"error": {...}}` *with* HTTP 200.
                limited, info = _is_ratelimited(data)
                if limited:
                    retry_after = _parse_retry_after(r.headers.get("Retry-After"))
                    sleep_s = _backoff_for(attempt, retry_after)
                    logger.warning(
                        "Cargo rate-limited (attempt %d/%d): %s — sleeping %.0fs",
                        attempt + 1, MAX_RETRIES, info or "(no info)", sleep_s,
                    )
                    time.sleep(sleep_s)
                    continue

                if isinstance(data, dict) and "error" in data:
                    err = data["error"]
                    code = err.get("code", "?")
                    # Fandom's MediaWiki sometimes wraps a backend rate-limit
                    # check failure as MWException — treat it as transient and
                    # back off instead of aborting the page.
                    if code in ("internal_api_error_MWException", "internal_api_error"):
                        retry_after = _parse_retry_after(r.headers.get("Retry-After"))
                        sleep_s = _backoff_for(attempt, retry_after)
                        logger.warning(
                            "Cargo MWException (attempt %d/%d): %s — sleeping %.0fs",
                            attempt + 1, MAX_RETRIES, err.get("info", "")[:160], sleep_s,
                        )
                        time.sleep(sleep_s)
                        continue
                    logger.error("Cargo API error (%s): %s", code, err.get("info", ""))
                    page = []
                    break

                page = [row.get("title", {}) for row in data.get("cargoquery", [])]
                break

            if page is None:
                logger.error(
                    "Cargo query gave up after %d retries (%s offset=%d)",
                    MAX_RETRIES, table, offset,
                )
                complete = False
                break
            _write_cache(cache_name, page)

        rows.extend(page)
        if len(page) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT
    return rows, complete


# ─── Date / patch helpers ─────────────────────────────────────────────────
def _format_since(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d 00:00:00")


def _normalize_patch(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    parts = p.strip().split(".")
    if len(parts) >= 2:
        return f"{parts[0]}.{parts[1]}"
    return p.strip()


def _normalize_role(r: Optional[str]) -> Optional[str]:
    if not r:
        return None
    return ROLE_NORMALIZE.get(r.strip().lower())


# ─── High-level fetchers ──────────────────────────────────────────────────
def fetch_scoreboard_games(
    client: httpx.Client,
    leagues: List[str],
    since: datetime,
    use_cache: bool = True,
) -> Tuple[List[Dict[str, Any]], bool]:
    fields = ",".join([
        "ScoreboardGames.Tournament=Tournament",
        "ScoreboardGames.Team1=Team1",
        "ScoreboardGames.Team2=Team2",
        "ScoreboardGames.Winner=Winner",
        "ScoreboardGames.Patch=Patch",
        "ScoreboardGames.DateTime_UTC=DateTime_UTC",
        "ScoreboardGames.GameId=GameId",
        "ScoreboardGames.OverviewPage=OverviewPage",
        "ScoreboardGames.N_GameInMatch=N_GameInMatch",
    ])

    league_clauses = " OR ".join(
        f"ScoreboardGames.OverviewPage LIKE '%{lg}%'" for lg in leagues
    )
    where = (
        f"({league_clauses}) "
        f"AND ScoreboardGames.DateTime_UTC >= '{_format_since(since)}'"
    )
    return _cargo_query(
        client,
        table="ScoreboardGames",
        fields=fields,
        where=where,
        order_by="ScoreboardGames.DateTime_UTC DESC",
        use_cache=use_cache,
    )


def fetch_picks_and_bans_by_overview(
    client: httpx.Client,
    overview_pages: List[str],
    use_cache: bool = True,
    state: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Dict[str, Any]], bool]:
    """Pull picks/bans grouped by OverviewPage (one query per wiki page).

    Why not Tournament filter: `PicksAndBansS7.Tournament = '...'` consistently
    returns `db_error` from Fandom's Cargo backend. OverviewPage is the
    canonical join field used elsewhere on the wiki.
    Why not GameId IN(...): an 80-ID IN clause produces an 8KB+ URL that
    MediaWiki silently truncates → empty results.

    With `state`, marks each OverviewPage as processed after success so
    --resume skips it on the next invocation.
    """
    fields_parts = [
        "PicksAndBansS7.GameId=GameId",
        "PicksAndBansS7.Tournament=Tournament",
        "PicksAndBansS7.OverviewPage=OverviewPage",
        "PicksAndBansS7.Winner=Winner",
        "PicksAndBansS7.Team1=Team1",
        "PicksAndBansS7.Team2=Team2",
    ]
    for i in range(1, 6):
        fields_parts.append(f"PicksAndBansS7.Team1Ban{i}=Team1Ban{i}")
        fields_parts.append(f"PicksAndBansS7.Team2Ban{i}=Team2Ban{i}")
        fields_parts.append(f"PicksAndBansS7.Team1Pick{i}=Team1Pick{i}")
        fields_parts.append(f"PicksAndBansS7.Team2Pick{i}=Team2Pick{i}")
        fields_parts.append(f"PicksAndBansS7.Team1Role{i}=Team1Role{i}")
        fields_parts.append(f"PicksAndBansS7.Team2Role{i}=Team2Role{i}")
    fields = ",".join(fields_parts)

    out: Dict[str, Dict[str, Any]] = {}
    complete = True
    for op in overview_pages:
        clean_op = op.replace("'", "''")  # SQL-escape single quotes
        where = f"PicksAndBansS7.OverviewPage = '{clean_op}'"
        rows, ok = _cargo_query(
            client,
            table="PicksAndBansS7",
            fields=fields,
            where=where,
            use_cache=use_cache,
        )
        added = 0
        for row in rows:
            gid = row.get("GameId")
            if gid:
                out[gid] = row
                added += 1
        logger.info("  OverviewPage %r → %d picks/bans rows", op, added)
        if not ok:
            complete = False
            logger.warning("OverviewPage %r gave up — keeping %d games so far", op, len(out))
            break
        if state is not None:
            done = set(state.get("processed_tournaments") or [])
            done.add(op)
            state["processed_tournaments"] = sorted(done)
            _save_state(state)
    return out, complete


# ─── Assembly ─────────────────────────────────────────────────────────────
def _detect_league(overview_page: str, leagues: List[str]) -> str:
    op = (overview_page or "").upper()
    for lg in leagues:
        if lg.upper() in op:
            return lg
    return "?"


def _build_draft(
    sb_row: Dict[str, Any],
    pb_row: Optional[Dict[str, Any]],
    leagues: List[str],
) -> Optional[Dict[str, Any]]:
    if not pb_row:
        return None

    bans: List[str] = []
    for i in range(1, 6):
        for side in ("Team1", "Team2"):
            v = pb_row.get(f"{side}Ban{i}")
            if v and v not in ("", "None", "Loss of Ban"):
                bans.append(v)

    team_picks: Dict[str, List[Dict[str, Any]]] = {"blue": [], "red": []}
    side_to_team_field = {"blue": "Team1", "red": "Team2"}
    for side, field in side_to_team_field.items():
        for i in range(1, 6):
            champ = pb_row.get(f"{field}Pick{i}")
            role = _normalize_role(pb_row.get(f"{field}Role{i}"))
            if not champ:
                continue
            team_picks[side].append({
                "team": side,
                "in_team_order": i,
                "role": role,
                "champion": champ,
            })

    picks_in_order: List[Dict[str, Any]] = []
    for global_idx, (side, in_team_idx) in enumerate(GLOBAL_PICK_ORDER, start=1):
        match = next(
            (p for p in team_picks[side] if p["in_team_order"] == in_team_idx),
            None,
        )
        if not match:
            return None
        picks_in_order.append({
            "team": side,
            "role": match["role"],
            "champion": match["champion"],
            "pick_order": global_idx,
        })

    raw_winner = sb_row.get("Winner") or pb_row.get("Winner")
    winner = "blue" if str(raw_winner) == "1" else "red" if str(raw_winner) == "2" else None

    overview = sb_row.get("OverviewPage") or pb_row.get("OverviewPage") or ""
    league = _detect_league(overview, leagues)

    game_id = sb_row.get("GameId") or pb_row.get("GameId")
    if not game_id:
        return None

    return {
        "game_id": game_id,
        "patch": _normalize_patch(sb_row.get("Patch")),
        "league": league,
        "tournament": sb_row.get("Tournament") or pb_row.get("Tournament"),
        "datetime_utc": sb_row.get("DateTime_UTC"),
        "blue_team": sb_row.get("Team1") or pb_row.get("Team1"),
        "red_team": sb_row.get("Team2") or pb_row.get("Team2"),
        "winner": winner,
        "bans": bans,
        "picks_in_order": picks_in_order,
    }


def _filter_by_patch(drafts: List[Dict[str, Any]], patches: Optional[List[str]]) -> List[Dict[str, Any]]:
    if not patches:
        return drafts
    keep = {p.strip() for p in patches}
    return [d for d in drafts if d.get("patch") in keep]


# ─── CLI ─────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Scrape Leaguepedia pro drafts.")
    ap.add_argument("--leagues", default=",".join(LEAGUES_TO_SCRAPE))
    ap.add_argument("--since", default=None)
    ap.add_argument("--patches", default=None)
    ap.add_argument("--max-games", type=int, default=None)
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument(
        "--resume", action="store_true",
        help="Resume from scrape_state.json instead of starting fresh.",
    )
    ap.add_argument("--output", default=str(OUTPUT_PATH))
    return ap.parse_args()


def _merge_existing_output(out_path: Path, new_drafts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge with whatever was already on disk (used by --resume)."""
    if not out_path.exists():
        return new_drafts
    try:
        prev = json.loads(out_path.read_text(encoding="utf-8"))
        if not isinstance(prev, list):
            return new_drafts
    except Exception:
        return new_drafts
    by_id: Dict[str, Dict[str, Any]] = {}
    for d in prev:
        gid = d.get("game_id")
        if gid:
            by_id[gid] = d
    for d in new_drafts:
        gid = d.get("game_id")
        if gid:
            by_id[gid] = d
    return list(by_id.values())


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    args = parse_args()
    started = time.time()

    state = _load_state() if args.resume else {"scoreboard_done": False, "processed_game_ids": []}
    if args.resume:
        logger.info(
            "Resuming: scoreboard_done=%s, %d game ids already processed",
            state.get("scoreboard_done"), len(state.get("processed_game_ids") or []),
        )

    leagues = [s.strip() for s in args.leagues.split(",") if s.strip()]
    if args.since:
        try:
            since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)
        except ValueError:
            logger.error("Invalid --since date: %s", args.since)
            return 1
    else:
        since = datetime.now(timezone.utc) - timedelta(days=DEFAULT_LOOKBACK_DAYS)

    explicit_patches = (
        [p.strip() for p in args.patches.split(",") if p.strip()]
        if args.patches else None
    )

    use_cache = not args.no_cache
    logger.info(
        "Fetching ScoreboardGames for %s since %s (cache=%s, UA=%r)",
        leagues, since.date(), use_cache, USER_AGENT,
    )

    sb_complete = True
    pb_complete = True
    with httpx.Client(headers={"User-Agent": USER_AGENT}) as client:
        sb_rows, sb_complete = fetch_scoreboard_games(client, leagues, since, use_cache=use_cache)
        logger.info("Got %d scoreboard rows (complete=%s)", len(sb_rows), sb_complete)
        if sb_rows:
            state["scoreboard_done"] = sb_complete
            _save_state(state)

        all_patches = sorted({_normalize_patch(r.get("Patch")) for r in sb_rows if r.get("Patch")})
        if not explicit_patches:
            explicit_patches = all_patches[-3:] if all_patches else []
        logger.info("Patch filter: %s", explicit_patches or "(none — all kept)")

        sb_by_id: Dict[str, Dict[str, Any]] = {}
        for r in sb_rows:
            gid = r.get("GameId")
            if gid:
                sb_by_id[gid] = r

        # Group by OverviewPage (the wiki page the games live under).
        # Tournament filter on PicksAndBansS7 returns db_error from Fandom's
        # backend, so OverviewPage is the only working join key.
        overview_pages_with_target = sorted({
            r["OverviewPage"]
            for r in sb_rows
            if r.get("OverviewPage")
            and ((not explicit_patches) or _normalize_patch(r.get("Patch")) in explicit_patches)
        })

        # Always iterate every target page: _cargo_query hits its on-disk
        # cache for previously-fetched ones, so resume is automatic.
        if args.resume:
            done = set(state.get("processed_tournaments") or [])
            already = sum(1 for op in overview_pages_with_target if op in done)
            logger.info(
                "Resume: %d/%d overview pages already cached, %d still need fetching",
                already, len(overview_pages_with_target),
                len(overview_pages_with_target) - already,
            )

        logger.info(
            "Fetching PicksAndBansS7 for %d overview page(s): %s",
            len(overview_pages_with_target), overview_pages_with_target,
        )
        pb_by_id, pb_complete = fetch_picks_and_bans_by_overview(
            client, overview_pages_with_target, use_cache=use_cache, state=state,
        )
        logger.info("Got picks/bans for %d games (complete=%s)", len(pb_by_id), pb_complete)

    drafts: List[Dict[str, Any]] = []
    for gid, sb_row in sb_by_id.items():
        d = _build_draft(sb_row, pb_by_id.get(gid), leagues)
        if d:
            drafts.append(d)

    drafts = _filter_by_patch(drafts, explicit_patches)
    drafts.sort(key=lambda d: d.get("datetime_utc") or "", reverse=True)

    if args.max_games:
        drafts = drafts[: args.max_games]

    out_path = Path(args.output)
    if args.resume:
        merged = _merge_existing_output(out_path, drafts)
        merged.sort(key=lambda d: d.get("datetime_utc") or "", reverse=True)
        if args.max_games:
            merged = merged[: args.max_games]
        drafts = merged

    out_path.write_text(json.dumps(drafts, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Wrote %d drafts → %s", len(drafts), out_path)

    by_league: Dict[str, int] = {}
    by_patch: Dict[str, int] = {}
    for d in drafts:
        by_league[d["league"]] = by_league.get(d["league"], 0) + 1
        by_patch[d["patch"] or "?"] = by_patch.get(d["patch"] or "?", 0) + 1
    logger.info("By league: %s", by_league)
    logger.info("By patch:  %s", by_patch)

    elapsed = time.time() - started
    logger.info("Total elapsed: %.1fs", elapsed)

    if drafts:
        # Partial success counts as success — caller can re-invoke with --resume.
        if not (sb_complete and pb_complete):
            logger.warning("Partial scrape — re-run with --resume to fill in the rest.")
        else:
            _clear_state()
        return 0

    # Nothing written → tell the shell so a retry loop can react.
    logger.error("No drafts retrieved. Exit non-zero so the caller can retry.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
