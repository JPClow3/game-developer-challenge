import type { SubmitMatchRequest, PendingSubmission, SubmitMatchResponse } from '../types/api';
import { apiClient } from './client';

const PENDING_STORAGE_KEY = 'pirate_battle_pending_submissions_v1';

export class PendingSubmissionQueue {
  private static instance: PendingSubmissionQueue | null = null;
  private queue: PendingSubmission[] = [];
  private isProcessing = false;
  private listeners: Set<() => void> = new Set();

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
        this.queue = JSON.parse(data);
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

  public enqueue(request: SubmitMatchRequest, errorMsg?: string): void {
    const existing = this.queue.find((item) => item.id === request.id);
    if (existing) {
      existing.retryCount++;
      if (errorMsg) existing.lastError = errorMsg;
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
          const res = await apiClient.post<SubmitMatchResponse>('/match', item.request);
          if (res.status === 200 || res.status === 201) {
            this.remove(item.id);
          }
        } catch (err) {
          // Update retry count and error message
          const target = this.queue.find((p) => p.id === item.id);
          if (target) {
            target.retryCount++;
            target.lastError = err instanceof Error ? err.message : String(err);
            this.saveToStorage();
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
