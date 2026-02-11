"""
LCU Connector — Connect to League Client Update API to read live draft data.

This service connects to the local LoL client via the LCU API to automatically
detect picks and bans during champion select.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import ssl
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

import aiohttp

logger = logging.getLogger("dalia.lcu")


@dataclass
class LCUCredentials:
    """LCU connection credentials parsed from lockfile."""
    process: str
    pid: int
    port: int
    password: str
    protocol: str

    @property
    def auth_header(self) -> str:
        """Return Base64 encoded auth header for LCU API."""
        creds = base64.b64encode(f"riot:{self.password}".encode()).decode()
        return f"Basic {creds}"

    @property
    def base_url(self) -> str:
        """Return the base URL for LCU API requests."""
        return f"{self.protocol}://127.0.0.1:{self.port}"


@dataclass
class DraftPlayer:
    """A player in champ select."""
    cell_id: int
    summoner_id: int
    champion_id: int = 0
    champion_pick_intent: int = 0
    team: str = ""  # "ally" or "enemy"
    role: str = ""  # assigned position


@dataclass 
class DraftAction:
    """An action in champ select (pick or ban)."""
    action_id: int
    actor_cell_id: int
    champion_id: int
    action_type: str  # "pick" or "ban"
    is_ally_action: bool
    is_in_progress: bool
    completed: bool


@dataclass
class LiveDraftState:
    """Current state of the live draft from LCU."""
    connected: bool = False
    in_champ_select: bool = False
    game_phase: str = ""
    
    # My info
    local_player_cell_id: int = -1
    my_team: str = ""  # "blue" or "red"
    my_role: str = ""
    
    # Bans
    ally_bans: List[int] = field(default_factory=list)
    enemy_bans: List[int] = field(default_factory=list)
    
    # Picks (role -> champion_id)
    ally_picks: Dict[str, int] = field(default_factory=dict)
    enemy_picks: Dict[str, int] = field(default_factory=dict)
    
    # Current action info
    current_action_type: str = ""  # "pick", "ban", or ""
    is_my_turn: bool = False
    timer_remaining: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "connected": self.connected,
            "in_champ_select": self.in_champ_select,
            "game_phase": self.game_phase,
            "my_team": self.my_team,
            "my_role": self.my_role,
            "ally_bans": self.ally_bans,
            "enemy_bans": self.enemy_bans,
            "ally_picks": self.ally_picks,
            "enemy_picks": self.enemy_picks,
            "current_action_type": self.current_action_type,
            "is_my_turn": self.is_my_turn,
            "timer_remaining": self.timer_remaining,
        }


# Mapping from LCU position names to our role names
POSITION_MAP = {
    "top": "top",
    "jungle": "jungle",
    "middle": "mid",
    "bottom": "bot",
    "utility": "support",
}


class LCUConnector:
    """
    Connects to the League Client Update (LCU) API to read live draft data.
    
    The LCU API is a local REST API exposed by the LoL client. Connection info
    is stored in a lockfile in the LoL installation directory.
    """
    
    # Common LoL installation paths
    DEFAULT_PATHS = [
        # Windows
        r"C:\Riot Games\League of Legends",
        r"D:\Riot Games\League of Legends",
        r"C:\Program Files\Riot Games\League of Legends",
        r"C:\Program Files (x86)\Riot Games\League of Legends",
        # Mac
        "/Applications/League of Legends.app/Contents/LoL",
    ]
    
    def __init__(self, lol_path: Optional[str] = None):
        """
        Initialize the LCU connector.
        
        Args:
            lol_path: Path to LoL installation. If None, will auto-detect.
        """
        self.lol_path = lol_path
        self._credentials: Optional[LCUCredentials] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._state = LiveDraftState()
        self._running = False
        self._poll_task: Optional[asyncio.Task] = None
        self._callbacks: List[Callable[[LiveDraftState], None]] = []
        
        # SSL context that ignores certificate verification (LCU uses self-signed cert)
        self._ssl_context = ssl.create_default_context()
        self._ssl_context.check_hostname = False
        self._ssl_context.verify_mode = ssl.CERT_NONE
    
    @property
    def state(self) -> LiveDraftState:
        """Get current draft state."""
        return self._state
    
    @property
    def is_connected(self) -> bool:
        """Check if connected to LCU."""
        return self._credentials is not None and self._session is not None
    
    def on_state_change(self, callback: Callable[[LiveDraftState], None]):
        """Register a callback for state changes."""
        self._callbacks.append(callback)
    
    def _notify_state_change(self):
        """Notify all callbacks of state change."""
        for cb in self._callbacks:
            try:
                cb(self._state)
            except Exception as e:
                logger.error(f"Callback error: {e}")
    
    def _find_lockfile(self) -> Optional[Path]:
        """Find the LoL lockfile."""
        # Try custom path first
        if self.lol_path:
            lockfile = Path(self.lol_path) / "lockfile"
            if lockfile.exists():
                return lockfile
        
        # Try default paths
        for path in self.DEFAULT_PATHS:
            lockfile = Path(path) / "lockfile"
            if lockfile.exists():
                logger.info(f"Found lockfile at: {lockfile}")
                return lockfile
        
        # Try to find via running process (Windows)
        try:
            import subprocess
            result = subprocess.run(
                ["wmic", "process", "where", "name='LeagueClientUx.exe'", 
                 "get", "ExecutablePath"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                lines = [l.strip() for l in result.stdout.split("\n") if l.strip() and "ExecutablePath" not in l]
                if lines:
                    exe_path = Path(lines[0])
                    # Go up to League of Legends directory
                    lol_dir = exe_path.parent.parent.parent
                    lockfile = lol_dir / "lockfile"
                    if lockfile.exists():
                        logger.info(f"Found lockfile via process: {lockfile}")
                        return lockfile
        except Exception as e:
            logger.debug(f"Could not find via process: {e}")
        
        return None
    
    def _parse_lockfile(self, lockfile: Path) -> Optional[LCUCredentials]:
        """Parse the lockfile to extract connection credentials."""
        try:
            content = lockfile.read_text()
            parts = content.split(":")
            if len(parts) >= 5:
                return LCUCredentials(
                    process=parts[0],
                    pid=int(parts[1]),
                    port=int(parts[2]),
                    password=parts[3],
                    protocol=parts[4].strip(),
                )
        except Exception as e:
            logger.error(f"Failed to parse lockfile: {e}")
        return None
    
    async def connect(self) -> bool:
        """
        Connect to the LCU API.
        
        Returns:
            True if connected successfully, False otherwise.
        """
        lockfile = self._find_lockfile()
        if not lockfile:
            logger.warning("LoL client not found. Is League of Legends running?")
            self._state.connected = False
            return False
        
        self._credentials = self._parse_lockfile(lockfile)
        if not self._credentials:
            logger.error("Failed to parse lockfile")
            self._state.connected = False
            return False
        
        # Create aiohttp session with auth headers
        connector = aiohttp.TCPConnector(ssl=self._ssl_context)
        self._session = aiohttp.ClientSession(
            connector=connector,
            headers={
                "Authorization": self._credentials.auth_header,
                "Accept": "application/json",
            }
        )
        
        # Test connection
        try:
            async with self._session.get(
                f"{self._credentials.base_url}/lol-summoner/v1/current-summoner"
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    logger.info(f"Connected to LCU as: {data.get('displayName', 'Unknown')}")
                    self._state.connected = True
                    return True
                else:
                    logger.error(f"LCU connection test failed: {resp.status}")
        except Exception as e:
            logger.error(f"Failed to connect to LCU: {e}")
        
        self._state.connected = False
        return False
    
    async def disconnect(self):
        """Disconnect from LCU API."""
        self._running = False
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        
        if self._session:
            await self._session.close()
            self._session = None
        
        self._credentials = None
        self._state = LiveDraftState()
    
    async def _get(self, endpoint: str) -> Optional[dict]:
        """Make a GET request to LCU API."""
        if not self._session or not self._credentials:
            return None
        
        try:
            async with self._session.get(
                f"{self._credentials.base_url}{endpoint}"
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                elif resp.status == 404:
                    return None  # Not in that state
                else:
                    logger.debug(f"LCU request failed: {endpoint} -> {resp.status}")
        except Exception as e:
            logger.debug(f"LCU request error: {endpoint} -> {e}")
        return None
    
    async def get_game_phase(self) -> str:
        """Get current game phase."""
        data = await self._get("/lol-gameflow/v1/gameflow-phase")
        if isinstance(data, str):
            return data
        return ""
    
    async def get_champ_select_session(self) -> Optional[dict]:
        """Get current champ select session data."""
        return await self._get("/lol-champ-select/v1/session")
    
    def _parse_champ_select(self, session: dict) -> LiveDraftState:
        """Parse champ select session into our draft state format."""
        state = LiveDraftState(connected=True, in_champ_select=True)
        
        # Get local player cell ID
        local_cell = session.get("localPlayerCellId", -1)
        state.local_player_cell_id = local_cell
        
        # Determine team (cells 0-4 are blue, 5-9 are red)
        if local_cell >= 0:
            state.my_team = "blue" if local_cell < 5 else "red"
        
        # Get timer
        timer = session.get("timer", {})
        state.timer_remaining = int(timer.get("adjustedTimeLeftInPhase", 0) / 1000)
        
        # Parse my team composition from the session
        my_team = session.get("myTeam", [])
        their_team = session.get("theirTeam", [])
        
        # Build cell_id -> position map
        cell_positions = {}
        for member in my_team:
            cell_id = member.get("cellId", -1)
            position = POSITION_MAP.get(member.get("assignedPosition", ""), "")
            cell_positions[cell_id] = position
            
            # Find my role
            if cell_id == local_cell:
                state.my_role = position
            
            # Get completed pick
            champion_id = member.get("championId", 0)
            if champion_id > 0 and position:
                state.ally_picks[position] = champion_id
        
        # Enemy team picks
        for member in their_team:
            position = POSITION_MAP.get(member.get("assignedPosition", ""), "")
            champion_id = member.get("championId", 0)
            if champion_id > 0 and position:
                state.enemy_picks[position] = champion_id
        
        # Parse actions for bans and in-progress picks
        actions = session.get("actions", [])
        
        for action_group in actions:
            for action in action_group:
                actor_cell = action.get("actorCellId", -1)
                is_ally = actor_cell < 5 if state.my_team == "blue" else actor_cell >= 5
                
                champion_id = action.get("championId", 0)
                action_type = action.get("type", "")
                completed = action.get("completed", False)
                is_in_progress = action.get("isInProgress", False)
                
                # Track bans
                if action_type == "ban" and completed and champion_id > 0:
                    if is_ally:
                        if champion_id not in state.ally_bans:
                            state.ally_bans.append(champion_id)
                    else:
                        if champion_id not in state.enemy_bans:
                            state.enemy_bans.append(champion_id)
                
                # Track current action
                if is_in_progress:
                    state.current_action_type = action_type
                    if actor_cell == local_cell:
                        state.is_my_turn = True
        
        return state
    
    async def poll_draft_state(self) -> LiveDraftState:
        """Poll and update the current draft state."""
        if not self.is_connected:
            connected = await self.connect()
            if not connected:
                return self._state
        
        # Check game phase
        phase = await self.get_game_phase()
        self._state.game_phase = phase
        
        if phase == "ChampSelect":
            session = await self.get_champ_select_session()
            if session:
                old_state = self._state
                self._state = self._parse_champ_select(session)
                self._state.game_phase = phase
                
                # Check if state changed
                if self._state.to_dict() != old_state.to_dict():
                    self._notify_state_change()
        else:
            # Not in champ select
            if self._state.in_champ_select:
                self._state = LiveDraftState(
                    connected=True,
                    in_champ_select=False,
                    game_phase=phase,
                )
                self._notify_state_change()
        
        return self._state
    
    async def start_polling(self, interval: float = 1.0):
        """
        Start polling draft state in the background.
        
        Args:
            interval: Polling interval in seconds.
        """
        self._running = True
        
        async def poll_loop():
            while self._running:
                try:
                    await self.poll_draft_state()
                except Exception as e:
                    logger.error(f"Polling error: {e}")
                    # Try to reconnect
                    self._credentials = None
                    if self._session:
                        await self._session.close()
                        self._session = None
                await asyncio.sleep(interval)
        
        self._poll_task = asyncio.create_task(poll_loop())
        logger.info(f"Started LCU polling (interval: {interval}s)")
    
    async def stop_polling(self):
        """Stop polling draft state."""
        self._running = False
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
            self._poll_task = None
        logger.info("Stopped LCU polling")


# Singleton instance
_connector: Optional[LCUConnector] = None


def get_lcu_connector(lol_path: Optional[str] = None) -> LCUConnector:
    """Get or create the LCU connector singleton."""
    global _connector
    if _connector is None:
        _connector = LCUConnector(lol_path)
    return _connector
