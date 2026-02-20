/// DALIA Tauri Client — Main entry point
///
/// Exposes LCU connector commands to the React frontend via Tauri IPC.
mod lcu;

use lcu::{LcuCredentials, LiveDraftState, SummonerInfo};
use std::sync::Mutex;
use tauri::State;

/// App state: holds current LCU credentials (if connected).
struct AppState {
    lcu_creds: Mutex<Option<LcuCredentials>>,
}

/// Try to connect to the League Client.
#[tauri::command]
async fn lcu_connect(state: State<'_, AppState>) -> Result<bool, String> {
    match lcu::connect().await {
        Some(creds) => {
            *state.lcu_creds.lock().unwrap() = Some(creds);
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Check LCU connection status. Auto-reconnects if credentials were lost.
#[tauri::command]
async fn lcu_status(state: State<'_, AppState>) -> Result<LiveDraftState, String> {
    let creds = {
        let guard = state.lcu_creds.lock().unwrap();
        guard.clone()
    };

    match creds {
        Some(ref c) => {
            let draft_state = lcu::poll_draft_state(c).await;
            // If polling says disconnected, clear creds so next call retries
            if !draft_state.connected {
                *state.lcu_creds.lock().unwrap() = None;
            }
            Ok(draft_state)
        }
        None => {
            // Auto-reconnect: try to find lockfile and connect
            match lcu::connect().await {
                Some(new_creds) => {
                    let draft_state = lcu::poll_draft_state(&new_creds).await;
                    *state.lcu_creds.lock().unwrap() = Some(new_creds);
                    Ok(draft_state)
                }
                None => Ok(LiveDraftState::default()),
            }
        }
    }
}

/// Disconnect from LCU.
#[tauri::command]
async fn lcu_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    *state.lcu_creds.lock().unwrap() = None;
    Ok(())
}

/// Fetch the summoner identity of the connected Riot account.
#[tauri::command]
async fn lcu_summoner(state: State<'_, AppState>) -> Result<SummonerInfo, String> {
    let creds = {
        let guard = state.lcu_creds.lock().unwrap();
        guard.clone()
    };

    match creds {
        Some(ref c) => Ok(lcu::fetch_summoner_info(c).await),
        None => {
            // Try auto-connect first
            match lcu::connect().await {
                Some(new_creds) => {
                    let info = lcu::fetch_summoner_info(&new_creds).await;
                    *state.lcu_creds.lock().unwrap() = Some(new_creds);
                    Ok(info)
                }
                None => Ok(SummonerInfo::default()),
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
        })
        .invoke_handler(tauri::generate_handler![
            lcu_connect,
            lcu_status,
            lcu_disconnect,
            lcu_summoner,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
