/// DALIA Tauri Client — Main entry point
///
/// Owns an always-on background supervisor that keeps the LCU connection
/// healthy without the frontend having to poll. The supervisor:
///   - probes every 3 s while disconnected
///   - polls draft state every 500 ms during champ select, 2 s otherwise
///   - emits Tauri events on every state/phase/connection transition so
///     the UI can react immediately instead of waiting for the next pull
mod lcu;

use lcu::{LcuCredentials, LiveDraftState, SummonerInfo};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

/// Shared state updated by the background supervisor and read by the
/// Tauri commands. Locks are held for a few microseconds at a time —
/// the supervisor clones out, works, and writes back.
pub struct AppState {
    pub lcu_creds: Mutex<Option<LcuCredentials>>,
    pub last_state: Mutex<LiveDraftState>,
    pub last_summoner: Mutex<SummonerInfo>,
}

/// Triggers the supervisor to attempt a reconnect on its next iteration.
#[tauri::command]
async fn lcu_connect(state: State<'_, AppState>) -> Result<bool, String> {
    let connected = state.lcu_creds.lock().unwrap().is_some();
    if connected {
        return Ok(true);
    }
    // Best-effort one-shot attempt so the user sees an immediate result
    // even if the supervisor's 3 s tick is about to fire.
    if let Some(creds) = lcu::connect().await {
        let summoner = lcu::fetch_summoner_info(&creds).await;
        *state.lcu_creds.lock().unwrap() = Some(creds);
        *state.last_summoner.lock().unwrap() = summoner;
        return Ok(true);
    }
    Ok(false)
}

/// Read the cached draft state. The supervisor keeps this fresh — the
/// frontend no longer needs to poll this command to stay in sync (it
/// subscribes to events instead), but we keep it available for manual
/// one-off reads.
#[tauri::command]
async fn lcu_status(state: State<'_, AppState>) -> Result<LiveDraftState, String> {
    Ok(state.last_state.lock().unwrap().clone())
}

/// Disconnect and clear all cached state. The supervisor will restart
/// from a clean slate on its next tick.
#[tauri::command]
async fn lcu_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    *state.lcu_creds.lock().unwrap() = None;
    *state.last_state.lock().unwrap() = LiveDraftState::default();
    *state.last_summoner.lock().unwrap() = SummonerInfo::default();
    Ok(())
}

#[tauri::command]
async fn lcu_summoner(state: State<'_, AppState>) -> Result<SummonerInfo, String> {
    Ok(state.last_summoner.lock().unwrap().clone())
}

/// The current gameflow phase (`None`, `Lobby`, `ChampSelect`, `InGame`,
/// `EndOfGame`, …). Empty string when not connected.
#[tauri::command]
async fn lcu_game_phase(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.last_state.lock().unwrap().game_phase.clone())
}

/// Long-running supervisor that keeps the LCU connection healthy.
/// Emits Tauri events so the frontend reacts instantly to transitions
/// (phase changes, connection drops) rather than waiting for its own
/// poll timer.
async fn supervisor_loop(app: AppHandle) {
    loop {
        let creds = { app.state::<AppState>().lcu_creds.lock().unwrap().clone() };

        match creds {
            None => {
                // Announce the searching state on every probe so the UI
                // can animate without relying on a timer of its own.
                let _ = app.emit("lcu:searching", ());

                if let Some(new_creds) = lcu::connect().await {
                    let summoner = lcu::fetch_summoner_info(&new_creds).await;
                    {
                        let s = app.state::<AppState>();
                        *s.lcu_creds.lock().unwrap() = Some(new_creds);
                        *s.last_summoner.lock().unwrap() = summoner.clone();
                    }
                    let _ = app.emit("lcu:connected", &summoner);
                    continue; // Skip the sleep and start polling immediately.
                }
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
            Some(ref c) => {
                let new_state = lcu::poll_draft_state(c).await;

                if !new_state.connected {
                    {
                        let s = app.state::<AppState>();
                        *s.lcu_creds.lock().unwrap() = None;
                        *s.last_state.lock().unwrap() = LiveDraftState::default();
                        *s.last_summoner.lock().unwrap() = SummonerInfo::default();
                    }
                    let _ = app.emit("lcu:disconnected", ());
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    continue;
                }

                // Detect phase changes before we overwrite the cache.
                let prev_phase = {
                    let s = app.state::<AppState>();
                    let phase = s.last_state.lock().unwrap().game_phase.clone();
                    phase
                };
                let phase_changed = prev_phase != new_state.game_phase;
                let phase_now = new_state.game_phase.clone();
                let in_champ_select = new_state.in_champ_select;

                {
                    let s = app.state::<AppState>();
                    *s.last_state.lock().unwrap() = new_state.clone();
                }

                if phase_changed {
                    let _ = app.emit("lcu:phase_changed", &phase_now);
                }
                let _ = app.emit("lcu:state_updated", &new_state);

                // Tight loop during champ select (500 ms), relaxed elsewhere (5 s).
                let sleep_ms = if in_champ_select { 500 } else { 5000 };
                tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            lcu_creds: Mutex::new(None),
            last_state: Mutex::new(LiveDraftState::default()),
            last_summoner: Mutex::new(SummonerInfo::default()),
        })
        .invoke_handler(tauri::generate_handler![
            lcu_connect,
            lcu_status,
            lcu_disconnect,
            lcu_summoner,
            lcu_game_phase,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                supervisor_loop(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
