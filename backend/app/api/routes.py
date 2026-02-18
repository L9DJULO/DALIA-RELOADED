"""DALIA — REST API routes."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.config import config
from app.models.draft import DraftRequest, DraftResponse, PoolEntry
from app.models.history import HistoryEntry, HistoryStats, HistoryPick
from app.models.user import UserProfile

logger = logging.getLogger("dalia.api")
router = APIRouter()


# ── Helper ───────────────────────────────────────────────────────────────
def _get_engine(request: Request):
    return request.app.state.draft_engine


def _get_db(request: Request):
    return request.app.state.champion_db


def _get_fetcher(request: Request):
    return request.app.state.fetcher


def _get_ban_recommender(request: Request):
    return request.app.state.ban_recommender


def _user_path(username: str = "default") -> Path:
    d = Path(config.user_data_dir)
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{username}.json"


def _history_path(username: str = "default") -> Path:
    d = Path(config.user_data_dir) / "history"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{username}_history.json"


def _load_history(username: str = "default") -> List[dict]:
    p = _history_path(username)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return []


def _save_history(entries: List[dict], username: str = "default"):
    p = _history_path(username)
    p.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")


# ═════════════════════════════════════════════════════════════════════════
#  CHAMPIONS
# ═════════════════════════════════════════════════════════════════════════
class ChampionOut(BaseModel):
    id: int
    key: str
    name: str
    title: str
    tags: list
    roles: list
    image_url: str
    damage_physical: float
    damage_magical: float
    damage_true: float
    primary_damage_type: str


@router.get("/champions", response_model=List[ChampionOut])
async def list_champions(request: Request, role: Optional[str] = None):
    """Return all champions (optionally filtered by role)."""
    db = _get_db(request)
    champs = db.champions_for_role(role) if role else db.all_champions()
    return [
        ChampionOut(
            id=c.id, key=c.key, name=c.name, title=c.title,
            tags=c.tags, roles=c.roles, image_url=c.image_url,
            damage_physical=c.damage.physical,
            damage_magical=c.damage.magical,
            damage_true=c.damage.true_dmg,
            primary_damage_type=c.primary_damage_type,
        )
        for c in sorted(champs, key=lambda x: x.name)
    ]


@router.get("/champions/{champion_id}")
async def get_champion(champion_id: int, request: Request):
    db = _get_db(request)
    c = db.get_by_id(champion_id)
    if not c:
        return {"error": "Champion not found"}
    return c.model_dump()


# ═════════════════════════════════════════════════════════════════════════
#  META / TIER LIST
# ═════════════════════════════════════════════════════════════════════════
@router.get("/meta/tierlist")
async def tierlist(request: Request, role: str = "mid"):
    """Return meta tier list for a role with scores."""
    engine = _get_engine(request)
    scores = await engine.meta.scores_for_role(role)
    db = _get_db(request)
    result = []
    for cid, s in sorted(scores.items(), key=lambda x: -x[1]):
        c = db.get_by_id(cid)
        if c:
            stats = db.get_stats(cid, role)
            result.append({
                "champion_id": cid,
                "champion_key": c.key,
                "champion_name": c.name,
                "image_url": c.image_url,
                "meta_score": s,
                "win_rate": stats.win_rate if stats else 50.0,
                "pick_rate": stats.pick_rate if stats else 0.0,
                "ban_rate": stats.ban_rate if stats else 0.0,
                "games": stats.games if stats else 0,
            })
    return result[:80]


# ═════════════════════════════════════════════════════════════════════════
#  DRAFT RECOMMENDATIONS
# ═════════════════════════════════════════════════════════════════════════
@router.post("/draft/recommend", response_model=DraftResponse)
async def draft_recommend(body: DraftRequest, request: Request):
    """Core endpoint: get champion recommendations for the current draft state."""
    engine = _get_engine(request)
    return await engine.recommend(body)


# ═════════════════════════════════════════════════════════════════════════
#  USER PROFILE
# ═════════════════════════════════════════════════════════════════════════
@router.get("/user/profile")
async def get_profile(username: str = "default"):
    p = _user_path(username)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return UserProfile(username=username).model_dump()


@router.post("/user/profile")
async def save_profile(profile: UserProfile):
    p = _user_path(profile.username)
    p.write_text(profile.model_dump_json(), encoding="utf-8")
    return {"status": "saved", "username": profile.username}


class PoolUpdateRequest(BaseModel):
    username: str = "default"
    role: str
    entries: List[PoolEntry]


@router.post("/user/pool")
async def update_pool(body: PoolUpdateRequest):
    """Update champion pool for a single role."""
    p = _user_path(body.username)
    if p.exists():
        profile = UserProfile(**json.loads(p.read_text(encoding="utf-8")))
    else:
        profile = UserProfile(username=body.username)

    profile.champion_pool[body.role] = body.entries
    p.write_text(profile.model_dump_json(), encoding="utf-8")
    return {"status": "updated", "role": body.role, "count": len(body.entries)}


# ═════════════════════════════════════════════════════════════════════════
#  PATCH INFO
# ═════════════════════════════════════════════════════════════════════════
@router.get("/patch")
async def current_patch(request: Request):
    fetcher = _get_fetcher(request)
    ver = await fetcher.get_ddragon_version()
    patch = await fetcher.get_current_patch()
    return {"version": ver, "patch": patch}


# ═════════════════════════════════════════════════════════════════════════
#  LCU (League Client) LIVE DRAFT
# ═════════════════════════════════════════════════════════════════════════
def _get_lcu(request: Request):
    return request.app.state.lcu_connector


@router.get("/lcu/status")
async def lcu_status(request: Request):
    """Check LCU connection status and current state."""
    lcu = _get_lcu(request)
    db = _get_db(request)
    state = lcu.state
    
    # Convert champion IDs to champion info
    def resolve_champions(ids: list) -> list:
        result = []
        for cid in ids:
            c = db.get_by_id(cid)
            if c:
                result.append({"id": c.id, "key": c.key, "name": c.name})
            else:
                result.append({"id": cid, "key": str(cid), "name": f"Unknown ({cid})"})
        return result
    
    def resolve_picks(picks: dict) -> dict:
        result = {}
        for role, cid in picks.items():
            c = db.get_by_id(cid)
            if c:
                result[role] = {"id": c.id, "key": c.key, "name": c.name}
            else:
                result[role] = {"id": cid, "key": str(cid), "name": f"Unknown ({cid})"}
        return result
    
    return {
        "connected": state.connected,
        "in_champ_select": state.in_champ_select,
        "game_phase": state.game_phase,
        "my_team": state.my_team,
        "my_role": state.my_role,
        "ally_bans": resolve_champions(state.ally_bans),
        "enemy_bans": resolve_champions(state.enemy_bans),
        "ally_picks": resolve_picks(state.ally_picks),
        "enemy_picks": resolve_picks(state.enemy_picks),
        "current_action_type": state.current_action_type,
        "is_my_turn": state.is_my_turn,
        "timer_remaining": state.timer_remaining,
    }


@router.post("/lcu/connect")
async def lcu_connect(request: Request):
    """Manually trigger LCU connection."""
    lcu = _get_lcu(request)
    connected = await lcu.connect()
    if connected:
        return {"status": "connected", "message": "Successfully connected to League Client"}
    return {"status": "disconnected", "message": "Could not connect. Is League of Legends running?"}


@router.post("/lcu/start-polling")
async def lcu_start_polling(request: Request, interval: float = 1.0):
    """Start automatic polling of draft state."""
    lcu = _get_lcu(request)
    await lcu.start_polling(interval)
    return {"status": "polling", "interval": interval}


@router.post("/lcu/stop-polling")
async def lcu_stop_polling(request: Request):
    """Stop automatic polling."""
    lcu = _get_lcu(request)
    await lcu.stop_polling()
    return {"status": "stopped"}


# ═════════════════════════════════════════════════════════════════════════
#  LCU OVERLAY DATA (compact endpoint for overlay window)
# ═════════════════════════════════════════════════════════════════════════
@router.get("/lcu/overlay")
async def lcu_overlay(request: Request):
    """Compact endpoint for the overlay: LCU state + top 3 recommendations."""
    lcu = _get_lcu(request)
    db = _get_db(request)
    engine = _get_engine(request)
    state = lcu.state

    def resolve(cid):
        c = db.get_by_id(cid)
        return {"id": c.id, "key": c.key, "name": c.name} if c else {"id": cid, "key": str(cid), "name": "?"}

    result = {
        "connected": state.connected,
        "in_champ_select": state.in_champ_select,
        "game_phase": state.game_phase,
        "my_team": state.my_team,
        "my_role": state.my_role,
        "is_my_turn": state.is_my_turn,
        "current_action_type": state.current_action_type,
        "timer_remaining": state.timer_remaining,
        "ally_bans": [resolve(cid) for cid in state.ally_bans],
        "enemy_bans": [resolve(cid) for cid in state.enemy_bans],
        "ally_picks": {r: resolve(cid) for r, cid in state.ally_picks.items()},
        "enemy_picks": {r: resolve(cid) for r, cid in state.enemy_picks.items()},
        "recommendations": [],
        "ban_suggestions": [],
    }
    return result


# ═════════════════════════════════════════════════════════════════════════
#  DRAFT HISTORY
# ═════════════════════════════════════════════════════════════════════════
@router.get("/history")
async def get_history(username: str = "default", limit: int = 50):
    """Return draft history entries, newest first."""
    entries = _load_history(username)
    entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return entries[:limit]


@router.post("/history")
async def save_history_entry(entry: HistoryEntry, username: str = "default"):
    """Save a new draft session to history."""
    entries = _load_history(username)
    if not entry.id:
        entry.id = str(uuid.uuid4())
    if not entry.timestamp:
        entry.timestamp = datetime.now(timezone.utc).isoformat()
    entries.append(entry.model_dump())
    _save_history(entries, username)
    return {"status": "saved", "id": entry.id}


class HistoryResultUpdate(BaseModel):
    result: str  # "win" | "loss" | "remake"
    notes: str = ""


@router.patch("/history/{entry_id}")
async def update_history_result(
    entry_id: str, body: HistoryResultUpdate, username: str = "default"
):
    """Update the result of a history entry (win/loss/remake)."""
    entries = _load_history(username)
    for e in entries:
        if e.get("id") == entry_id:
            e["result"] = body.result
            e["notes"] = body.notes
            _save_history(entries, username)
            return {"status": "updated", "id": entry_id}
    return {"status": "not_found", "id": entry_id}


@router.delete("/history/{entry_id}")
async def delete_history_entry(entry_id: str, username: str = "default"):
    """Delete a history entry."""
    entries = _load_history(username)
    entries = [e for e in entries if e.get("id") != entry_id]
    _save_history(entries, username)
    return {"status": "deleted", "id": entry_id}


@router.get("/history/stats")
async def get_history_stats(username: str = "default"):
    """Aggregated statistics from draft history."""
    entries = _load_history(username)
    total = len(entries)
    wins = sum(1 for e in entries if e.get("result") == "win")
    losses = sum(1 for e in entries if e.get("result") == "loss")
    remakes = sum(1 for e in entries if e.get("result") == "remake")
    unrecorded = total - wins - losses - remakes
    played = wins + losses
    wr = round((wins / played * 100), 1) if played > 0 else 0.0

    # Most picked champions
    champ_stats = {}
    for e in entries:
        cid = e.get("my_champion_id")
        if not cid:
            continue
        if cid not in champ_stats:
            champ_stats[cid] = {"champion_id": cid, "champion_name": e.get("my_champion_name", "?"), "champion_key": e.get("my_champion_key", ""), "count": 0, "wins": 0}
        champ_stats[cid]["count"] += 1
        if e.get("result") == "win":
            champ_stats[cid]["wins"] += 1

    most_picked = sorted(champ_stats.values(), key=lambda x: -x["count"])[:10]
    for mp in most_picked:
        p = mp["count"]
        w = mp["wins"]
        mp["win_rate"] = round(w / p * 100, 1) if p > 0 else 0.0

    # By role
    by_role = {}
    for e in entries:
        r = e.get("my_role", "")
        if not r:
            continue
        if r not in by_role:
            by_role[r] = {"games": 0, "wins": 0}
        by_role[r]["games"] += 1
        if e.get("result") == "win":
            by_role[r]["wins"] += 1
    for r, d in by_role.items():
        d["win_rate"] = round(d["wins"] / d["games"] * 100, 1) if d["games"] > 0 else 0.0

    # Recommendation follow rate
    followed = 0
    followed_wins = 0
    scores = []
    probs = []
    for e in entries:
        if e.get("recommendation_score"):
            scores.append(e["recommendation_score"])
        if e.get("win_probability"):
            probs.append(e["win_probability"])
        if e.get("recommended_champion") and e.get("my_champion_key") == e.get("recommended_champion"):
            followed += 1
            if e.get("result") == "win":
                followed_wins += 1

    return {
        "total_games": total,
        "wins": wins,
        "losses": losses,
        "remakes": remakes,
        "unrecorded": unrecorded,
        "win_rate": wr,
        "avg_recommendation_score": round(sum(scores) / len(scores), 1) if scores else 0,
        "avg_win_probability": round(sum(probs) / len(probs), 1) if probs else 0,
        "most_picked": most_picked,
        "by_role": by_role,
        "followed_recommendation": followed,
        "followed_recommendation_wins": followed_wins,
    }


# ═════════════════════════════════════════════════════════════════════════
#  BAN RECOMMENDATIONS
# ═════════════════════════════════════════════════════════════════════════
class BanRequest(BaseModel):
    my_role: str = "mid"
    champion_pool: Dict[str, List[PoolEntry]] = {}
    already_banned: List[int] = []
    already_picked: List[int] = []


@router.post("/draft/bans")
async def recommend_bans(body: BanRequest, request: Request):
    """Get ban recommendations based on pool and meta."""
    recommender = _get_ban_recommender(request)
    bans = await recommender.recommend_bans(
        my_role=body.my_role,
        champion_pool=body.champion_pool,
        already_banned=body.already_banned,
        already_picked=body.already_picked,
    )
    return {"ban_suggestions": bans}
