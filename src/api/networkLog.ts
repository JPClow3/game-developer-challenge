export interface NetworkEntry {
  id: number; method: string; path: string; attempt: number;
  state: 'pending' | 'success' | 'error' | 'cancelled stale response';
  status?: number; isDuplicate?: boolean; started: number; elapsed?: number;
}
let nextId = 0;
let entries: NetworkEntry[] = [];
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
export const networkLog = {
  snapshot: () => entries,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  clear: () => { entries = []; emit(); },
  start(method: string, path: string): number {
    const previous = [...entries].reverse().find(entry => entry.method === method && entry.path === path);
    const attempt = previous?.state === 'error' ? previous.attempt + 1 : 1;
    const id = ++nextId;
    entries = [...entries.slice(-79), { id, method, path, attempt, state: 'pending', started: performance.now() }];
    emit(); return id;
  },
  finish(id: number, update: Partial<NetworkEntry>) {
    entries = entries.map(entry => entry.id === id ? { ...entry, ...update, elapsed: Math.round(performance.now() - entry.started) } : entry);
    emit();
  },
};
