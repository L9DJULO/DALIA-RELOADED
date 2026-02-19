/// DALIA Tauri Client — Main entry point
///
/// Exposes LCU connector commands to the React frontend via Tauri IPC.
mod lcu;

use lcu::{LcuCredentials, LiveDraftState};
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

/// Check LCU connection status.
#[tauri::command]
async fn lcu_status(state: State<'_, AppState>) -> Result<LiveDraftState, String> {
    let creds = {
        let guard = state.lcu_creds.lock().unwrap();
        guard.clone()
    };

    match creds {
        Some(ref c) => Ok(lcu::poll_draft_state(c).await),
        None => Ok(LiveDraftState::default()),
    }
}

/// Disconnect from LCU.
#[tauri::command]
async fn lcu_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    *state.lcu_creds.lock().unwrap() = None;
    Ok(())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
