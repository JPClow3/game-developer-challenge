import axios from 'axios';
import { networkLog } from './networkLog';

declare module 'axios' { interface InternalAxiosRequestConfig { networkLogId?: number; } }

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

export function isRetryableApiError(error: unknown): boolean {
  return !(error instanceof ApiRequestError) || error.status === undefined ||
    error.status === 408 || error.status === 429 || error.status >= 500;
}

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(config => {
  config.networkLogId = networkLog.start((config.method || 'get').toUpperCase(), `${config.url}${config.params ? '?' + new URLSearchParams(Object.entries(config.params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])) : ''}`);
  return config;
});
apiClient.interceptors.response.use(
  (response) => {
    networkLog.finish(response.config.networkLogId!, { state: 'success', status: response.status, isDuplicate: response.data?.isDuplicate });
    return response;
  },
  (error) => {
    networkLog.finish(error.config?.networkLogId, { state: axios.isCancel(error) ? 'cancelled stale response' : 'error', status: error.response?.status });
    if (axios.isCancel(error)) return Promise.reject(error);
    // Standardize error messaging
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected network error occurred';
    return Promise.reject(new ApiRequestError(message, error.response?.status));
  }
);
