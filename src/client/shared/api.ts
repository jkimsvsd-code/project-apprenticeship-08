import type { ApiErrorBody } from '../../shared/contracts.js';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(15_000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    response = await fetch(path, { ...init, signal, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...init.headers } });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (error instanceof Error && error.name === 'TimeoutError') throw new ApiError(0, 'REQUEST_TIMEOUT', '서버 응답 시간이 지났습니다. 연결을 확인하고 다시 시도해 주세요.');
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
  }
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  }
  return data as T;
}
export const post = <T>(path: string, body: unknown = {}, init: RequestInit = {}) => api<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) });
