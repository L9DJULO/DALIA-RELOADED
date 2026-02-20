/// DALIA Client — LCU (League Client Update) Connector
///
/// Reads the League of Legends lockfile to connect to the local LCU API
/// and retrieve live champion select data.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows flag to prevent CMD windows from appearing.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// LCU connection credentials parsed from the lockfile.
#[derive(Debug, Clone)]
pub struct LcuCredentials {
    pub port: u16,
    pub password: String,
    pub protocol: String,
}

/// Live draft state from champion select.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LiveDraftState {
    pub connected: bool,
    pub in_champ_select: bool,
    pub game_phase: String,
    pub my_team: String,
    pub my_role: String,
    pub ally_bans: Vec<i64>,
    pub enemy_bans: Vec<i64>,
    pub ally_picks: HashMap<String, i64>,
    pub enemy_picks: HashMap<String, i64>,
    pub current_action_type: String,
    pub is_my_turn: bool,
    pub timer_remaining: f64,
}

/// Summoner identity from LCU (linked Riot account).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SummonerInfo {
    pub available: bool,
    pub puuid: String,
    pub game_name: String,
    pub tag_line: String,
    pub summoner_id: i64,
    pub account_id: i64,
    pub summoner_level: i64,
    pub profile_icon_id: i64,
    pub region: String,
}

// Role mapping from cell ID to role
fn cell_to_role(cell_id: i64) -> &'static str {
    match cell_id % 5 {
        0 => "top",
        1 => "jungle",
        2 => "mid",
        3 => "bot",
        4 => "support",
        _ => "unknown",
    }
}

fn cell_to_team(cell_id: i64) -> &'static str {
    if cell_id < 5 { "blue" } else { "red" }
}

/// Find the League of Legends lockfile.
/// Searches common paths on all available drives, RiotClientInstalls.json,
/// and falls back to process detection.
pub fn find_lockfile() -> Option<PathBuf> {
    // 1. Scan all drive letters with common install sub-paths
    let sub_paths = vec![
        r"Riot Games\League of Legends\lockfile",
        r"Program Files\Riot Games\League of Legends\lockfile",
        r"Program Files (x86)\Riot Games\League of Legends\lockfile",
        r"Games\League of Legends\lockfile",
        r"League of Legends\lockfile",
    ];

    for drive in b'C'..=b'Z' {
        let drive_letter = drive as char;
        for sub in &sub_paths {
            let p = PathBuf::from(format!("{}:\\{}", drive_letter, sub));
            if p.exists() {
                return Some(p);
            }
        }
    }

    // 2. Try RiotClientInstalls.json (created by Riot Client on all installs)
    if let Some(lockfile) = find_lockfile_from_riot_installs() {
        return Some(lockfile);
    }

    // 3. Fallback: find LeagueClientUx.exe process and derive lockfile path
    if let Some(lockfile) = find_lockfile_from_process() {
        return Some(lockfile);
    }

    None
}

/// Parse RiotClientInstalls.json to find League installation path.
fn find_lockfile_from_riot_installs() -> Option<PathBuf> {
    if let Some(app_data) = dirs_next::data_local_dir() {
        let riot_installs = app_data.join("Riot Games").join("RiotClientInstalls.json");
        if riot_installs.exists() {
            if let Ok(content) = std::fs::read_to_string(&riot_installs) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    // associated_client maps League install paths to their Riot Client paths
                    if let Some(obj) = json.get("associated_client").and_then(|v| v.as_object()) {
                        for (install_path, _) in obj {
                            // The keys are League installation paths (may use / or \)
                            let normalized = install_path.replace('/', "\\");
                            let league_dir = PathBuf::from(&normalized);
                            let lockfile = league_dir.join("lockfile");
                            if lockfile.exists() {
                                return Some(lockfile);
                            }
                            // Sometimes the path points to the root, lockfile is inside
                            // the League of Legends subfolder
                            let alt_lockfile = league_dir.join("League of Legends").join("lockfile");
                            if alt_lockfile.exists() {
                                return Some(alt_lockfile);
                            }
                        }
                    }
                    // Also check rc_default path
                    if let Some(default_path) = json.get("rc_default").and_then(|v| v.as_str()) {
                        let normalized = default_path.replace('/', "\\");
                        let rc_dir = PathBuf::from(&normalized);
                        // Riot Client is usually next to League of Legends
                        if let Some(parent) = rc_dir.parent() {
                            let lockfile = parent.join("League of Legends").join("lockfile");
                            if lockfile.exists() {
                                return Some(lockfile);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// Find lockfile by looking at running LeagueClientUx.exe process.
fn find_lockfile_from_process() -> Option<PathBuf> {
    // Use WMIC to find LeagueClientUx.exe path
    let mut cmd = std::process::Command::new("wmic");
    cmd.args(["process", "where", "name='LeagueClientUx.exe'", "get", "ExecutablePath"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("ExecutablePath") {
            continue;
        }
        // Path looks like: D:\Riot Games\League of Legends\LeagueClientUx.exe
        let exe_path = PathBuf::from(trimmed);
        if let Some(parent) = exe_path.parent() {
            let lockfile = parent.join("lockfile");
            if lockfile.exists() {
                return Some(lockfile);
            }
        }
    }

    // Also try tasklist + wmic for League processes via cmd
    let mut cmd2 = std::process::Command::new("cmd");
    cmd2.args(["/c", "wmic process where \"name like '%LeagueClient%'\" get ExecutablePath 2>nul"]);
    #[cfg(target_os = "windows")]
    cmd2.creation_flags(CREATE_NO_WINDOW);
    let output2 = cmd2.output().ok()?;

    let stdout2 = String::from_utf8_lossy(&output2.stdout);
    for line in stdout2.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("ExecutablePath") {
            continue;
        }
        let exe_path = PathBuf::from(trimmed);
        if let Some(parent) = exe_path.parent() {
            let lockfile = parent.join("lockfile");
            if lockfile.exists() {
                return Some(lockfile);
            }
        }
    }

    None
}

/// Parse the lockfile content into credentials.
pub fn parse_lockfile(content: &str) -> Option<LcuCredentials> {
    let parts: Vec<&str> = content.trim().split(':').collect();
    if parts.len() < 5 {
        return None;
    }
    Some(LcuCredentials {
        port: parts[2].parse().ok()?,
        password: parts[3].to_string(),
        protocol: parts[4].to_string(),
    })
}

/// Create an HTTP client that accepts self-signed certificates (LCU uses one).
fn create_lcu_client() -> reqwest::Client {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Failed to create HTTP client")
}

/// Connect to LCU and return credentials if successful.
pub async fn connect() -> Option<LcuCredentials> {
    let lockfile_path = find_lockfile()?;
    let content = std::fs::read_to_string(&lockfile_path).ok()?;
    let creds = parse_lockfile(&content)?;

    // Verify connection
    let client = create_lcu_client();
    let auth = STANDARD.encode(format!("riot:{}", creds.password));
    let url = format!("https://127.0.0.1:{}/lol-login/v1/session", creds.port);

    match client
        .get(&url)
        .header("Authorization", format!("Basic {}", auth))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 404 => Some(creds),
        _ => None,
    }
}

/// Poll the current champion select state from LCU.
pub async fn poll_draft_state(creds: &LcuCredentials) -> LiveDraftState {
    let client = create_lcu_client();
    let auth = STANDARD.encode(format!("riot:{}", creds.password));
    let base = format!("https://127.0.0.1:{}", creds.port);

    let mut state = LiveDraftState {
        connected: true,
        ..Default::default()
    };

    // Check game phase
    let phase_url = format!("{}/lol-gameflow/v1/gameflow-phase", base);
    let phase = match client
        .get(&phase_url)
        .header("Authorization", format!("Basic {}", auth))
        .send()
        .await
    {
        Ok(resp) => resp.text().await.unwrap_or_default().trim_matches('"').to_string(),
        Err(_) => {
            state.connected = false;
            return state;
        }
    };

    state.game_phase = phase.clone();
    if phase != "ChampSelect" {
        return state;
    }
    state.in_champ_select = true;

    // Get champion select session
    let session_url = format!("{}/lol-champ-select/v1/session", base);
    let session: serde_json::Value = match client
        .get(&session_url)
        .header("Authorization", format!("Basic {}", auth))
        .send()
        .await
    {
        Ok(resp) => match resp.json().await {
            Ok(v) => v,
            Err(_) => return state,
        },
        Err(_) => return state,
    };

    // Find local player cell ID
    let local_cell = session["localPlayerCellId"].as_i64().unwrap_or(-1);

    // Helper: normalise LCU assignedPosition → internal role key
    let normalise_pos = |pos: &str| -> &'static str {
        match pos {
            "top"     => "top",
            "jungle"  => "jungle",
            "middle"  => "mid",
            "bottom"  => "bot",
            "utility" => "support",
            _         => "",
        }
    };

    // Build cellId → role map from BOTH myTeam and theirTeam arrays.
    // This is the only reliable way to know each player's assigned role;
    // the old cell_to_role(cell_id % 5) was pure position-index guesswork.
    let mut cell_role_map: HashMap<i64, String> = HashMap::new();
    for team_key in &["myTeam", "theirTeam"] {
        if let Some(team) = session[*team_key].as_array() {
            for member in team {
                if let (Some(cid), Some(pos)) = (
                    member["cellId"].as_i64(),
                    member["assignedPosition"].as_str(),
                ) {
                    let role = normalise_pos(pos);
                    if !role.is_empty() {
                        cell_role_map.insert(cid, role.to_string());
                    }
                }
            }
        }
    }

    if local_cell >= 0 {
        state.my_team = cell_to_team(local_cell).to_string();
        if let Some(role) = cell_role_map.get(&local_cell) {
            state.my_role = role.clone();
        }
    }

    // Parse actions (bans and picks)
    if let Some(actions) = session["actions"].as_array() {
        for action_group in actions {
            if let Some(group) = action_group.as_array() {
                for action in group {
                    let action_type = action["type"].as_str().unwrap_or("");
                    let champion_id = action["championId"].as_i64().unwrap_or(0);
                    let cell_id = action["actorCellId"].as_i64().unwrap_or(-1);
                    let completed = action["completed"].as_bool().unwrap_or(false);
                    let is_in_progress = action["isInProgress"].as_bool().unwrap_or(false);

                    let is_ally = cell_to_team(cell_id) == cell_to_team(local_cell);
                    let is_me = cell_id == local_cell;

                    if is_me && is_in_progress {
                        state.is_my_turn = true;
                        state.current_action_type = action_type.to_string();
                    }

                    if champion_id == 0 {
                        continue;
                    }

                    match action_type {
                        "ban" if completed => {
                            if is_ally {
                                state.ally_bans.push(champion_id);
                            } else {
                                state.enemy_bans.push(champion_id);
                            }
                        }
                        "pick" if completed => {
                            // Use the assignedPosition from the team arrays (reliable).
                            // Falls back to positional index only when position is unassigned
                            // (e.g. custom games or very early in draft before roles are set).
                            let role = cell_role_map
                                .get(&cell_id)
                                .cloned()
                                .unwrap_or_else(|| cell_to_role(cell_id).to_string());
                            if is_ally {
                                state.ally_picks.insert(role, champion_id);
                            } else {
                                state.enemy_picks.insert(role, champion_id);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // Timer
    if let Some(timer) = session["timer"].as_object() {
        let total = timer.get("adjustedTimeLeftInPhase")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        state.timer_remaining = (total / 1000.0).max(0.0);
    }

    state
}

/// Fetch the current summoner's identity from LCU.
pub async fn fetch_summoner_info(creds: &LcuCredentials) -> SummonerInfo {
    let client = create_lcu_client();
    let auth = STANDARD.encode(format!("riot:{}", creds.password));
    let base = format!("https://127.0.0.1:{}", creds.port);

    let mut info = SummonerInfo::default();

    // Get current summoner
    let url = format!("{}/lol-summoner/v1/current-summoner", base);
    let summoner: serde_json::Value = match client
        .get(&url)
        .header("Authorization", format!("Basic {}", auth))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => match resp.json().await {
            Ok(v) => v,
            Err(_) => return info,
        },
        _ => return info,
    };

    info.available = true;
    info.puuid = summoner["puuid"].as_str().unwrap_or("").to_string();
    info.game_name = summoner["gameName"].as_str().unwrap_or("").to_string();
    info.tag_line = summoner["tagLine"].as_str().unwrap_or("").to_string();
    info.summoner_id = summoner["summonerId"].as_i64().unwrap_or(0);
    info.account_id = summoner["accountId"].as_i64().unwrap_or(0);
    info.summoner_level = summoner["summonerLevel"].as_i64().unwrap_or(0);
    info.profile_icon_id = summoner["profileIconId"].as_i64().unwrap_or(0);

    // Detect region from LCU environment
    let region_url = format!("{}/riotclient/region-locale", base);
    if let Ok(resp) = client
        .get(&region_url)
        .header("Authorization", format!("Basic {}", auth))
        .send()
        .await
    {
        if let Ok(region_data) = resp.json::<serde_json::Value>().await {
            info.region = region_data["region"].as_str().unwrap_or("EUW1").to_string();
        }
    }

    info
}
