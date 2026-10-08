const PLAYER_ID_KEY = 'pirate_battle_player_id_v1';
const PLAYER_NAME_KEY = 'pirate_battle_player_name_v1';

export function getOrCreatePlayerId(): string {
  if (typeof window === 'undefined') return 'captain_temp';
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = 'player_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function getPlayerName(): string {
  if (typeof window === 'undefined') return 'Captain Corsair';
  let name = localStorage.getItem(PLAYER_NAME_KEY);
  if (!name) {
    name = 'Captain Corsair';
    localStorage.setItem(PLAYER_NAME_KEY, name);
  }
  return name;
}

export function setPlayerName(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PLAYER_NAME_KEY, name.trim());
}

export function adoptServerPlayerId(playerId: string): void {
  localStorage.setItem(PLAYER_ID_KEY, playerId);
}

/**
 * Generates an RFC 4122 compliant UUID v4 string for idempotent match submissions.
 */
export function generateUUIDv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
