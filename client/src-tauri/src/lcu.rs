/// DALIA Client — LCU (League Client Update) Connector
///
/// Reads the League of Legends lockfile to connect to the local LCU API
/// and retrieve live champion select data. Uses a multi-strategy detection
/// chain to remain robust across all Windows install layouts.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// LCU connection credentials parsed from the lockfile or the LeagueClientUx
/// command line. Either source yields the same three fields.
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
    pub enemy_picks_order: Vec<i64>,
    pub ally_prepicks: HashMap<String, i64>,
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

// ═══════════════════════════════════════════════════════════════════════
//  LOCKFILE DETECTION
// ═══════════════════════════════════════════════════════════════════════

/// Multi-strategy lockfile detection. Tries every known location until one
/// yields a readable lockfile. Ordered from cheapest/most-reliable to most
/// expensive. Every strategy is independent — a failure in one does not
/// abort the chain.
pub fn find_lockfile() -> Option<PathBuf> {
    if let Some(p) = find_lockfile_from_riot_installs() {
        return Some(p);
    }
    if let Some(p) = find_lockfile_from_known_paths() {
        return Some(p);
    }
    if let Some(p) = find_lockfile_from_drive_scan() {
        return Some(p);
    }
    #[cfg(target_os = "windows")]
    if let Some(p) = find_lockfile_from_registry() {
        return Some(p);
    }
    if let Some(p) = find_lockfile_from_process() {
        return Some(p);
    }
    None
}

/// Strategy 1: parse `%LOCALAPPDATA%\Riot Games\RiotClientInstalls.json`.
/// This file is authoritative because the Riot Client writes it on every
/// install/update with the exact install paths.
fn find_lockfile_from_riot_installs() -> Option<PathBuf> {
    let app_data = dirs_next::data_local_dir()?;
    let riot_installs = app_data.join("Riot Games").join("RiotClientInstalls.json");
    let content = std::fs::read_to_string(&riot_installs).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;

    if let Some(obj) = json.get("associated_client").and_then(|v| v.as_object()) {
        for (install_path, _) in obj {
            let normalized = install_path.replace('/', "\\");
            let league_dir = PathBuf::from(normalized.trim_end_matches('\\'));
            if let Some(lock) = first_existing_lockfile(&league_dir) {
                return Some(lock);
            }
        }
    }

    if let Some(default_path) = json.get("rc_default").and_then(|v| v.as_str()) {
        let normalized = default_path.replace('/', "\\");
        let rc_exe = PathBuf::from(normalized);
        if let Some(riot_games) = rc_exe.parent().and_then(|p| p.parent()) {
            let league = riot_games.join("League of Legends");
            if let Some(lock) = first_existing_lockfile(&league) {
                return Some(lock);
            }
        }
    }
    None
}

/// Strategy 2: check common install locations derived from environment
/// variables (`%PROGRAMFILES%`, `%PROGRAMFILES(X86)%`, `%LOCALAPPDATA%`)
/// and the usual drive-root folders.
fn find_lockfile_from_known_paths() -> Option<PathBuf> {
    let mut bases: Vec<PathBuf> = Vec::new();

    for env in &["PROGRAMFILES", "ProgramW6432", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
        if let Ok(v) = std::env::var(env) {
            bases.push(PathBuf::from(v).join("Riot Games").join("League of Legends"));
        }
    }

    for root in &[r"C:\", r"D:\", r"E:\", r"F:\"] {
        bases.push(PathBuf::from(root).join("Riot Games").join("League of Legends"));
    }

    for base in bases {
        if let Some(lock) = first_existing_lockfile(&base) {
            return Some(lock);
        }
    }
    None
}

/// Strategy 3: exhaustive drive letter scan (A-Z) against every sub-path
/// that a user could plausibly have picked. Keeps the I/O cheap — each
/// probe is a single `PathBuf::exists()` call.
fn find_lockfile_from_drive_scan() -> Option<PathBuf> {
    let sub_paths = [
        r"Riot Games\League of Legends",
        r"Program Files\Riot Games\League of Legends",
        r"Program Files (x86)\Riot Games\League of Legends",
        r"Games\Riot Games\League of Legends",
        r"Games\League of Legends",
        r"League of Legends",
    ];

    for drive in b'A'..=b'Z' {
        let drive_letter = drive as char;
        for sub in &sub_paths {
            let base = PathBuf::from(format!("{}:\\{}", drive_letter, sub));
            if let Some(lock) = first_existing_lockfile(&base) {
                return Some(lock);
            }
        }
    }
    None
}

/// Strategy 4: Windows registry. The Riot Client registers its URI handler
/// under `HKCU\Software\Classes\riotclient`, and Riot Games installs used
/// to write an install path under `HKLM\SOFTWARE\Riot Games` (including
/// the WOW6432Node mirror on 64-bit machines).
#[cfg(target_os = "windows")]
fn find_lockfile_from_registry() -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    // HKCU\Software\Classes\riotclient\shell\open\command default value:
    //   "C:\Riot Games\Riot Client\RiotClientServices.exe" "--launch-product=..." ...
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(r"Software\Classes\riotclient\shell\open\command") {
        if let Ok(val) = key.get_value::<String, _>("") {
            if let Some(exe) = extract_first_quoted_or_token(&val) {
                if let Some(league) = league_dir_from_riot_client_exe(&exe) {
                    if let Some(lock) = first_existing_lockfile(&league) {
                        return Some(lock);
                    }
                }
            }
        }
    }

    // HKLM\SOFTWARE\Riot Games (+ WOW6432Node mirror).
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for root in &[r"SOFTWARE\Riot Games", r"SOFTWARE\WOW6432Node\Riot Games"] {
        if let Ok(rg_key) = hklm.open_subkey(root) {
            // Direct values on the parent key (older installers).
            for val_name in &["Path", "InstallLocation", "Location"] {
                if let Ok(p) = rg_key.get_value::<String, _>(val_name) {
                    let league = league_dir_from_any_install(&p);
                    if let Some(lock) = first_existing_lockfile(&league) {
                        return Some(lock);
                    }
                }
            }
            // Subkeys per product.
            for sub in rg_key.enum_keys().flatten() {
                if let Ok(sub_key) = rg_key.open_subkey(&sub) {
                    for val_name in &["Path", "InstallLocation", "Location"] {
                        if let Ok(p) = sub_key.get_value::<String, _>(val_name) {
                            let league = league_dir_from_any_install(&p);
                            if let Some(lock) = first_existing_lockfile(&league) {
                                return Some(lock);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn league_dir_from_riot_client_exe(riot_client_exe: &str) -> Option<PathBuf> {
    // Typical: C:\Riot Games\Riot Client\RiotClientServices.exe
    // League is sibling: C:\Riot Games\League of Legends
    let exe = PathBuf::from(riot_client_exe);
    let riot_games = exe.parent()?.parent()?;
    Some(riot_games.join("League of Legends"))
}

#[cfg(target_os = "windows")]
fn league_dir_from_any_install(raw: &str) -> PathBuf {
    let p = PathBuf::from(raw.trim_matches('"').trim_end_matches('\\'));
    // Some entries point at "Riot Games" root, some already at "League of Legends".
    if p.file_name().map(|n| n == "League of Legends").unwrap_or(false) {
        p
    } else {
        p.join("League of Legends")
    }
}

/// Strategy 5: locate a running `LeagueClientUx.exe` and read its command
/// line. This is the ultimate fallback — even a manually-moved or
/// portable install reveals itself here, because we can read both the
/// exe path and the `--install-directory`, `--app-port`,
/// `--remoting-auth-token` arguments directly.
fn find_lockfile_from_process() -> Option<PathBuf> {
    let cmdlines = query_process_cmdlines("LeagueClientUx.exe")?;
    for cmdline in &cmdlines {
        // Prefer the explicit --install-directory argument.
        if let Some(dir) = extract_cli_arg(cmdline, "install-directory") {
            let lockfile = PathBuf::from(&dir).join("lockfile");
            if lockfile.exists() {
                return Some(lockfile);
            }
        }
        // Otherwise derive from the exe path.
        if let Some(exe) = extract_first_quoted_or_token(cmdline) {
            let exe_path = PathBuf::from(&exe);
            if let Some(parent) = exe_path.parent() {
                let lockfile = parent.join("lockfile");
                if lockfile.exists() {
                    return Some(lockfile);
                }
            }
        }
    }
    None
}

// ═══════════════════════════════════════════════════════════════════════
//  PROCESS COMMAND LINE HELPERS
// ═══════════════════════════════════════════════════════════════════════

/// Pull the credentials directly from the running LeagueClientUx process
/// command line. Used as a last-resort bypass when the lockfile is missing
/// or unreadable (antivirus quarantine, permission issues, race at startup).
pub fn credentials_from_process() -> Option<LcuCredentials> {
    let cmdlines = query_process_cmdlines("LeagueClientUx.exe")?;
    for cmdline in &cmdlines {
        let port = extract_cli_arg(cmdline, "app-port")
            .and_then(|v| v.parse::<u16>().ok());
        let password = extract_cli_arg(cmdline, "remoting-auth-token");
        if let (Some(port), Some(password)) = (port, password) {
            return Some(LcuCredentials {
                port,
                password,
                protocol: "https".to_string(),
            });
        }
    }
    None
}

/// Query Windows for the command line of every process with the given name.
/// Tries WMIC first (fast) and falls back to PowerShell's
/// `Get-CimInstance` on systems where WMIC has been removed.
fn query_process_cmdlines(process_name: &str) -> Option<Vec<String>> {
    // WMIC path.
    let mut wmic = std::process::Command::new("wmic");
    wmic.args([
        "process",
        "where",
        &format!("name='{}'", process_name),
        "get",
        "CommandLine",
        "/format:list",
    ]);
    #[cfg(target_os = "windows")]
    wmic.creation_flags(CREATE_NO_WINDOW);
    if let Ok(output) = wmic.output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let results: Vec<String> = stdout
            .lines()
            .filter_map(|l| l.strip_prefix("CommandLine=").map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .collect();
        if !results.is_empty() {
            return Some(results);
        }
    }

    // PowerShell fallback.
    let ps_cmd = format!(
        "Get-CimInstance Win32_Process -Filter \"Name='{}'\" | Select-Object -ExpandProperty CommandLine",
        process_name
    );
    let mut ps = std::process::Command::new("powershell");
    ps.args(["-NoProfile", "-NonInteractive", "-Command", &ps_cmd]);
    #[cfg(target_os = "windows")]
    ps.creation_flags(CREATE_NO_WINDOW);
    if let Ok(output) = ps.output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let results: Vec<String> = stdout
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if !results.is_empty() {
            return Some(results);
        }
    }
    None
}

/// Extract a CLI argument value supporting all of:
///   --foo=bar        --foo "bar"        "--foo=bar with spaces"
///   "--foo=C:\path"  --foo=C:\path      --foo C:\path
/// The `arg_name` is the argument *without* leading dashes (e.g. "app-port").
fn extract_cli_arg(cmdline: &str, arg_name: &str) -> Option<String> {
    // Three shell-quoting shapes to handle:
    //   --arg=value-no-spaces
    //   --arg="value with spaces"
    //   "--arg=value with spaces"   ← the whole token is quoted
    // For the last form, we detect the leading `"` by peeking the char
    // immediately before the match and read until the closing `"`.
    let needle_eq = format!("--{}=", arg_name);
    if let Some(idx) = cmdline.find(&needle_eq) {
        let before = cmdline[..idx].chars().last();
        let rest = &cmdline[idx + needle_eq.len()..];
        if before == Some('"') {
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
        return Some(read_value(rest));
    }
    let needle_space = format!("--{} ", arg_name);
    if let Some(idx) = cmdline.find(&needle_space) {
        let rest = &cmdline[idx + needle_space.len()..];
        return Some(read_value(rest));
    }
    None
}

/// Read a single value from a CLI string: either a quoted run, or a
/// whitespace-terminated token. Terminating `"` is also stripped.
fn read_value(rest: &str) -> String {
    let rest = rest.trim_start();
    if let Some(stripped) = rest.strip_prefix('"') {
        if let Some(end) = stripped.find('"') {
            return stripped[..end].to_string();
        }
        return stripped.to_string();
    }
    rest.split(|c: char| c.is_whitespace() || c == '"')
        .next()
        .unwrap_or("")
        .trim_end_matches('"')
        .to_string()
}

/// Pull the first path-like token from a raw command-line string. Handles
/// the common `"C:\...\exe" --arg=...` pattern as well as unquoted forms.
fn extract_first_quoted_or_token(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if let Some(stripped) = trimmed.strip_prefix('"') {
        let end = stripped.find('"')?;
        return Some(stripped[..end].to_string());
    }
    trimmed.split_whitespace().next().map(|s| s.to_string())
}

// ═══════════════════════════════════════════════════════════════════════
//  LOCKFILE READ / PARSE
// ═══════════════════════════════════════════════════════════════════════

/// Check for the lockfile inside a given directory. Accepts both the
/// directory itself and a direct file path. Returns the lockfile path if
/// it exists and is a regular file.
fn first_existing_lockfile(base: &Path) -> Option<PathBuf> {
    // Direct lockfile path.
    if base.is_file() && base.file_name().map(|n| n == "lockfile").unwrap_or(false) {
        return Some(base.to_path_buf());
    }
    let candidate = base.join("lockfile");
    if candidate.exists() {
        return Some(candidate);
    }
    None
}

/// Read the lockfile, handling UTF-8, UTF-16 LE/BE with or without BOM.
/// League itself writes UTF-8 today, but users have reported UTF-16 on
/// locale-specific installs, so we handle both.
fn read_lockfile(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&u16s).ok();
    }
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&u16s).ok();
    }
    // UTF-8 (with optional BOM).
    let text = String::from_utf8_lossy(&bytes).to_string();
    Some(text.trim_start_matches('\u{feff}').to_string())
}

/// Parse the lockfile content into credentials. Tolerates CRLF/LF,
/// stray whitespace, blank leading lines, and trailing content.
pub fn parse_lockfile(content: &str) -> Option<LcuCredentials> {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    for raw_line in normalized.lines() {
        let line = raw_line.trim().trim_start_matches('\u{feff}');
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() < 5 {
            continue;
        }
        let port = parts[2].trim().parse().ok()?;
        return Some(LcuCredentials {
            port,
            password: parts[3].trim().to_string(),
            protocol: parts[4].trim().to_string(),
        });
    }
    None
}

// ═══════════════════════════════════════════════════════════════════════
//  HTTP / LCU REQUESTS
// ═══════════════════════════════════════════════════════════════════════

/// Create an HTTP client that accepts the LCU self-signed certificate.
/// The LCU binds to 127.0.0.1 only, so accepting invalid certs here is
/// equivalent to trusting localhost — which we already do.
fn create_lcu_client() -> reqwest::Client {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("Failed to create HTTP client")
}

/// Attempt to connect to a running LCU. Tries the lockfile first, then
/// falls back to scraping the LeagueClientUx command line. Returns `None`
/// only if *both* strategies fail to produce working credentials.
pub async fn connect() -> Option<LcuCredentials> {
    // Lockfile path.
    if let Some(path) = find_lockfile() {
        if let Some(content) = read_lockfile(&path) {
            if let Some(creds) = parse_lockfile(&content) {
                if verify_credentials(&creds).await {
                    return Some(creds);
                }
            }
        }
    }

    // Command-line path (independent fallback).
    if let Some(creds) = credentials_from_process() {
        if verify_credentials(&creds).await {
            return Some(creds);
        }
    }

    None
}

/// Probe an LCU endpoint to confirm the credentials work. Accepts any
/// 2xx/4xx response as proof of connectivity — only network/TLS errors
/// mean "not the LCU".
async fn verify_credentials(creds: &LcuCredentials) -> bool {
    let client = create_lcu_client();
    let auth = STANDARD.encode(format!("riot:{}", creds.password));
    let url = format!("https://127.0.0.1:{}/lol-login/v1/session", creds.port);
    match client
        .get(&url)
        .header("Authorization", format!("Basic {}", auth))
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status().as_u16();
            (200..500).contains(&status)
        }
        Err(_) => false,
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

    let local_cell = session["localPlayerCellId"].as_i64().unwrap_or(-1);

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

    let mut cell_role_map: HashMap<i64, String> = HashMap::new();
    let mut ally_intents: HashMap<i64, i64> = HashMap::new();
    for team_key in &["myTeam", "theirTeam"] {
        if let Some(team) = session[*team_key].as_array() {
            for member in team {
                if let Some(cid) = member["cellId"].as_i64() {
                    let is_my_team = *team_key == "myTeam";

                    if let Some(pos) = member["assignedPosition"].as_str() {
                        let role = normalise_pos(pos);
                        if !role.is_empty() {
                            cell_role_map.insert(cid, role.to_string());
                        }
                    }

                    if is_my_team && cid != local_cell {
                        let intent = member["championPickIntent"].as_i64().unwrap_or(0);
                        if intent > 0 {
                            ally_intents.insert(cid, intent);
                        }
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
                            if is_ally {
                                let role = cell_role_map
                                    .get(&cell_id)
                                    .cloned()
                                    .unwrap_or_else(|| cell_to_role(cell_id).to_string());
                                state.ally_picks.insert(role, champion_id);
                            } else {
                                if let Some(role) = cell_role_map.get(&cell_id) {
                                    state.enemy_picks.insert(role.clone(), champion_id);
                                }
                                state.enemy_picks_order.push(champion_id);
                            }
                        }
                        "pick" if !completed && champion_id > 0 && is_ally && !is_me => {
                            if let Some(role) = cell_role_map.get(&cell_id) {
                                state.ally_prepicks.insert(role.clone(), champion_id);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    let picked_ids: std::collections::HashSet<i64> = state
        .ally_picks
        .values()
        .chain(state.enemy_picks.values())
        .chain(state.enemy_picks_order.iter())
        .chain(state.ally_bans.iter())
        .chain(state.enemy_bans.iter())
        .copied()
        .collect();

    for (cell_id, intent_champ) in &ally_intents {
        if let Some(role) = cell_role_map.get(cell_id) {
            if state.ally_picks.contains_key(role) {
                continue;
            }
            if picked_ids.contains(intent_champ) {
                continue;
            }
            if !state.ally_prepicks.contains_key(role) {
                state.ally_prepicks.insert(role.clone(), *intent_champ);
            }
        }
    }

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
