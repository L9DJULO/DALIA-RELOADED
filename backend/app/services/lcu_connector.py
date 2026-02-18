"""
LCU Connector — Connect to League Client Update API to read live draft data.

This service connects to the local LoL client via the LCU API to automatically
detect picks and bans during champion select.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import ssl
import subprocess
import time
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

# Standard cell-to-role mapping in ranked (cells 0-4 = blue, 5-9 = red)
# Within each team the order is: top, jungle, mid, bot, support
CELL_TO_ROLE = {
    0: "top", 1: "jungle", 2: "mid", 3: "bot", 4: "support",
    5: "top", 6: "jungle", 7: "mid", 8: "bot", 9: "support",
}


class LCUConnector:
    """
    Connects to the League Client Update (LCU) API to read live draft data.
    
    The LCU API is a local REST API exposed by the LoL client. Connection info
    is stored in a lockfile in the LoL installation directory.
    """
    
    # Common LoL installation paths
    DEFAULT_PATHS = [
        # Windows – common Riot install locations
        r"C:\Riot Games\League of Legends",
        r"D:\Riot Games\League of Legends",
        r"E:\Riot Games\League of Legends",
        r"C:\Program Files\Riot Games\League of Legends",
        r"C:\Program Files (x86)\Riot Games\League of Legends",
        r"D:\Program Files\Riot Games\League of Legends",
        r"D:\Program Files (x86)\Riot Games\League of Legends",
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
        self._last_not_found_logged: float = 0  # throttle "not found" warnings
        
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
    
    # ------------------------------------------------------------------
    # Lockfile discovery helpers
    # ------------------------------------------------------------------

    def _find_lockfile(self) -> Optional[Path]:
        """Find the LoL lockfile using multiple strategies."""
        # Try custom path first
        if self.lol_path:
            lockfile = Path(self.lol_path) / "lockfile"
            if lockfile.exists():
                return lockfile

        # 1) Static default paths
        for path in self.DEFAULT_PATHS:
            lockfile = Path(path) / "lockfile"
            if lockfile.exists():
                logger.info(f"Found lockfile at: {lockfile}")
                return lockfile

        # 2) Windows-only strategies
        if os.name == "nt":
            found = (
                self._find_lockfile_via_powershell()
                or self._find_lockfile_via_wmic()
                or self._find_lockfile_via_registry()
                or self._find_lockfile_via_riot_yaml()
            )
            if found:
                return found

        return None

    # -- Strategy: PowerShell (recommended on modern Windows) -----------

    @staticmethod
    def _find_lockfile_via_powershell() -> Optional[Path]:
        """Locate the lockfile by querying LeagueClientUx.exe via PowerShell."""
        try:
            # --command-line contains the full path to the lockfile in quotes
            # but the simplest approach is to get the process executable path.
            result = subprocess.run(
                [
                    "powershell", "-NoProfile", "-Command",
                    "(Get-Process LeagueClientUx -ErrorAction SilentlyContinue"
                    " | Select-Object -First 1).Path",
                ],
                capture_output=True, text=True, timeout=8,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            exe = (result.stdout or "").strip()
            if exe:
                return LCUConnector._lockfile_from_exe(exe, "PowerShell")
        except Exception as e:
            logger.debug(f"PowerShell lockfile search failed: {e}")
        return None

    # -- Strategy: PowerShell command-line (--install-directory) --------

    @staticmethod
    def _find_lockfile_via_powershell_cmdline() -> Optional[Path]:
        """Parse --install-directory from the LeagueClientUx command line."""
        try:
            result = subprocess.run(
                [
                    "powershell", "-NoProfile", "-Command",
                    "(Get-CimInstance Win32_Process -Filter "
                    "\"name='LeagueClientUx.exe'\" -ErrorAction SilentlyContinue"
                    " | Select-Object -First 1).CommandLine",
                ],
                capture_output=True, text=True, timeout=8,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            cmdline = (result.stdout or "").strip()
            if cmdline:
                # Extract --install-directory="<path>"
                m = re.search(r'--install-directory[=\s]+"?([^"]+)"?', cmdline)
                if m:
                    lol_dir = Path(m.group(1).rstrip("/\\"))
                    lockfile = lol_dir / "lockfile"
                    if lockfile.exists():
                        logger.info(f"Found lockfile via cmdline: {lockfile}")
                        return lockfile
        except Exception as e:
            logger.debug(f"PowerShell cmdline lockfile search failed: {e}")
        return None

    # -- Strategy: wmic (legacy fallback) --------------------------------

    @staticmethod
    def _find_lockfile_via_wmic() -> Optional[Path]:
        """Locate the lockfile using wmic (deprecated but still on many PCs)."""
        try:
            result = subprocess.run(
                [
                    "wmic", "process", "where",
                    "name='LeagueClientUx.exe'",
                    "get", "ExecutablePath",
                ],
                capture_output=True, text=True, timeout=8,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if result.returncode == 0:
                lines = [
                    l.strip()
                    for l in result.stdout.split("\n")
                    if l.strip() and "ExecutablePath" not in l
                ]
                if lines:
                    return LCUConnector._lockfile_from_exe(lines[0], "wmic")
        except Exception as e:
            logger.debug(f"wmic lockfile search failed: {e}")
        return None

    # -- Strategy: Windows Registry --------------------------------------

    @staticmethod
    def _find_lockfile_via_registry() -> Optional[Path]:
        """Try to read the Riot Games install path from the Windows registry."""
        try:
            import winreg
            # Riot Client stores its install path here
            for key_path in (
                r"SOFTWARE\WOW6432Node\Riot Games, Inc\League of Legends",
                r"SOFTWARE\Riot Games, Inc\League of Legends",
                r"SOFTWARE\WOW6432Node\Riot Games\Riot Client",
                r"SOFTWARE\Riot Games\Riot Client",
            ):
                try:
                    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
                        for value_name in ("Path", "InstallLocation", "InstallPath"):
                            try:
                                val, _ = winreg.QueryValueEx(key, value_name)
                                if val:
                                    p = Path(val)
                                    # It may point to the Riot Client; adjust to LoL
                                    for candidate in (
                                        p / "lockfile",
                                        p / "League of Legends" / "lockfile",
                                        p.parent / "League of Legends" / "lockfile",
                                    ):
                                        if candidate.exists():
                                            logger.info(f"Found lockfile via registry: {candidate}")
                                            return candidate
                            except FileNotFoundError:
                                continue
                except FileNotFoundError:
                    continue
        except Exception as e:
            logger.debug(f"Registry lockfile search failed: {e}")
        return None

    # -- Strategy: Riot Client YAML config --------------------------------

    @staticmethod
    def _find_lockfile_via_riot_yaml() -> Optional[Path]:
        """Read the League path from the Riot Client's product-settings YAML."""
        try:
            riot_data = Path(os.environ.get("LOCALAPPDATA", "")) / "Riot Games" / "RiotClientInstalls.json"
            if riot_data.exists():
                data = json.loads(riot_data.read_text(encoding="utf-8"))
                # The JSON contains paths to the Riot Client; we look for
                # associated_client which maps RiotClient -> LoL directory.
                assoc = data.get("associated_client", {})
                for _rc_path, lol_dir_str in assoc.items():
                    lockfile = Path(lol_dir_str) / "lockfile"
                    if lockfile.exists():
                        logger.info(f"Found lockfile via RiotClientInstalls.json: {lockfile}")
                        return lockfile

            # Also try ProgramData path
            prog_data = Path(os.environ.get("ALLUSERSPROFILE", r"C:\ProgramData"))
            settings_file = prog_data / "Riot Games" / "RiotClientInstalls.json"
            if settings_file.exists():
                data = json.loads(settings_file.read_text(encoding="utf-8"))
                assoc = data.get("associated_client", {})
                for _rc_path, lol_dir_str in assoc.items():
                    lockfile = Path(lol_dir_str) / "lockfile"
                    if lockfile.exists():
                        logger.info(f"Found lockfile via RiotClientInstalls: {lockfile}")
                        return lockfile
        except Exception as e:
            logger.debug(f"Riot YAML lockfile search failed: {e}")
        return None

    # -- Helper -----------------------------------------------------------

    @staticmethod
    def _lockfile_from_exe(exe_path_str: str, source: str) -> Optional[Path]:
        """Given the path to LeagueClientUx.exe, walk up to find the lockfile."""
        exe_path = Path(exe_path_str)
        # The lockfile lives in the League of Legends root (2-3 levels up
        # depending on Riot's packaging).
        for parent in (exe_path.parent, exe_path.parent.parent, exe_path.parent.parent.parent):
            lockfile = parent / "lockfile"
            if lockfile.exists():
                logger.info(f"Found lockfile via {source}: {lockfile}")
                return lockfile
        logger.debug(f"{source} found exe at {exe_path_str} but no lockfile in parents")
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
            now = time.time()
            # Only log the warning once every 30 seconds to avoid spam
            if now - self._last_not_found_logged >= 30:
                logger.warning("LoL client not found. Is League of Legends running?")
                self._last_not_found_logged = now
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
        
        # Build cell_id -> position map for both teams
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
        # NOTE: The LCU API does NOT provide assignedPosition for the enemy
        # team, so we infer the role from the cellId using the standard
        # ranked mapping (0/5=top, 1/6=jungle, 2/7=mid, 3/8=bot, 4/9=support).
        for member in their_team:
            cell_id = member.get("cellId", -1)
            position = POSITION_MAP.get(member.get("assignedPosition", ""), "")
            if not position:
                position = CELL_TO_ROLE.get(cell_id, "")
            cell_positions[cell_id] = position
            
            champion_id = member.get("championId", 0)
            if champion_id > 0 and position:
                state.enemy_picks[position] = champion_id
        
        # Parse actions for bans, enemy picks, and in-progress state
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
                
                # Track enemy picks from actions (fallback if theirTeam
                # did not already provide the champion).
                if action_type == "pick" and completed and champion_id > 0 and not is_ally:
                    position = cell_positions.get(actor_cell, CELL_TO_ROLE.get(actor_cell, ""))
                    if position and position not in state.enemy_picks:
                        state.enemy_picks[position] = champion_id
                
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
