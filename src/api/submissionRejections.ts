export interface SubmissionRejection {
  id: string;
  message: string;
  status: number;
}

const STORAGE_KEY = 'pirate_battle_submission_rejections_v1';
const MAX_RECORDS = 50;

/** Terminal outcomes survive removal from the retry queue and a page reload. */
export class SubmissionRejections {
  private records = new Map<string, SubmissionRejection>();

  constructor() {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(stored)) {
        for (const value of stored.slice(-MAX_RECORDS)) {
          if (value && typeof value.id === 'string' && typeof value.message === 'string' &&
              Number.isInteger(value.status) && value.status >= 400 && value.status < 500 &&
              value.status !== 408 && value.status !== 429) {
            this.records.set(value.id, { id: value.id, message: value.message, status: value.status });
          }
        }
      }
    } catch { /* Storage can be blocked or corrupt; in-memory feedback still works. */ }
  }

  get(id: string): SubmissionRejection | undefined { return this.records.get(id); }

  record(rejection: SubmissionRejection): void {
    this.records.delete(rejection.id);
    this.records.set(rejection.id, rejection);
    if (this.records.size > MAX_RECORDS) this.records.delete(this.records.keys().next().value!);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.records.values()])); }
    catch { /* Keep the outcome for this session when persistence is unavailable. */ }
  }
}
