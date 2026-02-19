/// DALIA Client — LCU (League Client Update) Connector
///
/// Reads the League of Legends lockfile to connect to the local LCU API
/// and retrieve live champion select data.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

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
pub fn find_lockfile() -> Option<PathBuf> {
    let candidates = vec![
        // Common Windows install locations
        r"C:\Riot Games\League of Legends\lockfile",
        r"D:\Riot Games\League of Legends\lockfile",
        r"C:\Program Files\Riot Games\League of Legends\lockfile",
        r"C:\Program Files (x86)\Riot Games\League of Legends\lockfile",
        r"D:\Program Files\Riot Games\League of Legends\lockfile",
        r"D:\Program Files (x86)\Riot Games\League of Legends\lockfile",
    ];

    for path in candidates {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }

    // Try RiotClientInstalls.json
    if let Some(app_data) = dirs_next::data_local_dir() {
        let riot_installs = app_data.join("Riot Games").join("RiotClientInstalls.json");
        if riot_installs.exists() {
            if let Ok(content) = std::fs::read_to_string(&riot_installs) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(path) = json.get("associated_client") {
                        if let Some(obj) = path.as_object() {
                            for (install_path, _) in obj {
                                let lockfile = PathBuf::from(install_path).join("lockfile");
                                if lockfile.exists() {
                                    return Some(lockfile);
                                }
                            }
                        }
                    }
                }
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
    if local_cell >= 0 {
        state.my_team = cell_to_team(local_cell).to_string();
        // Try to find assigned position from myTeam array
        if let Some(my_team) = session["myTeam"].as_array() {
            for member in my_team {
                if member["cellId"].as_i64() == Some(local_cell) {
                    if let Some(pos) = member["assignedPosition"].as_str() {
                        state.my_role = match pos {
                            "top" => "top",
                            "jungle" => "jungle",
                            "middle" => "mid",
                            "bottom" => "bot",
                            "utility" => "support",
                            other => other,
                        }
                        .to_string();
                    }
                }
            }
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
                            let role = cell_to_role(cell_id).to_string();
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
