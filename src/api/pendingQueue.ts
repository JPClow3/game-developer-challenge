import type { SubmitMatchRequest, PendingSubmission, SubmitMatchResponse } from '../types/api';
import { apiClient, isRetryableApiError } from './client';

const PENDING_STORAGE_KEY = 'pirate_battle_pending_submissions_v1';

export class PendingSubmissionQueue {
  private static instance: PendingSubmissionQueue | null = null;
  private queue: PendingSubmission[] = [];
  private isProcessing = false;
  private listeners: Set<() => void> = new Set();
  private inFlight = new Map<string, Promise<SubmitMatchResponse>>();
  private onSynced: (() => Promise<unknown>) | undefined;

  private constructor() {
    this.loadFromStorage();
    this.setupOnlineListener();
  }

  private setupOnlineListener(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
      this.processQueue().catch((err) => {
        console.warn('Failed auto-syncing pending submissions on online event', err);
      });
    });
  }

  public static getInstance(): PendingSubmissionQueue {
    if (!PendingSubmissionQueue.instance) {
      PendingSubmissionQueue.instance = new PendingSubmissionQueue();
    }
    return PendingSubmissionQueue.instance;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const data = localStorage.getItem(PENDING_STORAGE_KEY);
      if (data) {
        const parsed: unknown = JSON.parse(data);
        // Corrupt or foreign data must not break submission and startup sync.
        this.queue = Array.isArray(parsed)
          ? parsed.filter((item): item is PendingSubmission =>
              !!item && typeof item === 'object' && typeof item.id === 'string' &&
              !!item.request && typeof item.request === 'object' && item.request.id === item.id &&
              Number.isFinite(item.retryCount))
          : [];
      }
    } catch {
      this.queue = [];
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('Failed to save pending submissions', e);
    }
    this.notify();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  public getPending(): readonly PendingSubmission[] {
    return this.queue;
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  /** Called after the mock worker or live API is ready, once per application boot. */
  public startAutoSync(onSynced: () => Promise<unknown>): void {
    this.onSynced = onSynced;
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void this.processQueue().catch((error) => console.warn('Failed startup sync', error));
    }
  }

  public submit(request: SubmitMatchRequest): Promise<SubmitMatchResponse> {
    const existing = this.inFlight.get(request.id);
    if (existing) return existing;
    // Persist before dispatch, so a tab closing during the request cannot lose the result.
    this.enqueue(request);
    const operation = this.send(request).finally(() => this.inFlight.delete(request.id));
    this.inFlight.set(request.id, operation);
    return operation;
  }

  private async send(request: SubmitMatchRequest): Promise<SubmitMatchResponse> {
    try {
      const response = await apiClient.post<SubmitMatchResponse>('/match', request);
      this.remove(request.id);
      // Cache refresh must not turn an acknowledged write into a failed submission.
      await this.onSynced?.().catch((error) => console.warn('Failed refreshing synced queries', error));
      return response.data;
    } catch (error) {
      if (isRetryableApiError(error)) {
        this.enqueue(request, error instanceof Error ? error.message : String(error));
      } else {
        this.remove(request.id);
      }
      throw error;
    }
  }

  public enqueue(request: SubmitMatchRequest, errorMsg?: string): void {
    const existing = this.queue.find((item) => item.id === request.id);
    if (existing) {
      if (errorMsg) { existing.retryCount++; existing.lastError = errorMsg; }
    } else {
      this.queue.push({
        id: request.id,
        request,
        timestamp: Date.now(),
        retryCount: 0,
        lastError: errorMsg,
      });
    }
    this.saveToStorage();
  }

  public remove(id: string): void {
    this.queue = this.queue.filter((item) => item.id !== id);
    this.saveToStorage();
  }

  public async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      const pendingSnapshot = [...this.queue];
      for (const item of pendingSnapshot) {
        try {
          await this.submit(item.request);
        } catch {
          // submit retains transient failures and removes permanent rejections.
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
