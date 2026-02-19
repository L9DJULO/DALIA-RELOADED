/**
 * DALIA Client — LCU Service (Tauri IPC).
 *
 * Calls the Rust LCU connector via Tauri commands.
 * Falls back to a no-op if not running inside Tauri.
 */

const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

let invoke = null;

const getInvoke = async () => {
  if (invoke) return invoke;
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    invoke = tauriInvoke;
    return invoke;
  }
  return null;
};

/**
 * Try to connect to the local League Client.
 * @returns {Promise<boolean>} true if connected
 */
export const lcuConnect = async () => {
  const inv = await getInvoke();
  if (!inv) return false;
  try {
    return await inv('lcu_connect');
  } catch (e) {
    console.warn('LCU connect failed:', e);
    return false;
  }
};

/**
 * Get the current champion select state from LCU.
 * @returns {Promise<object>} LiveDraftState
 */
export const lcuStatus = async () => {
  const inv = await getInvoke();
  if (!inv) {
    return {
      connected: false,
      in_champ_select: false,
      game_phase: '',
      my_team: '',
      my_role: '',
      ally_bans: [],
      enemy_bans: [],
      ally_picks: {},
      enemy_picks: {},
      current_action_type: '',
      is_my_turn: false,
      timer_remaining: 0,
    };
  }
  try {
    return await inv('lcu_status');
  } catch (e) {
    console.warn('LCU status failed:', e);
    return { connected: false, in_champ_select: false };
  }
};

/**
 * Disconnect from LCU.
 */
export const lcuDisconnect = async () => {
  const inv = await getInvoke();
  if (!inv) return;
  try {
    await inv('lcu_disconnect');
  } catch (e) {
    console.warn('LCU disconnect failed:', e);
  }
};
