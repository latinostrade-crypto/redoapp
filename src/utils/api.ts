export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://yoapp-backend.onrender.com';
const SESSION_TOKEN_STORAGE_KEY = 'redoapp_session_token';
// Render documents an approximately one-minute wake-up for idle free services.
const API_REQUEST_TIMEOUT_MS = 90000;
const API_TRACE_EVENT = 'redoapp:api-trace';

export type ApiTraceDetail = {
  id: string;
  path: string;
  method: string;
  url: string;
  attempt: number;
  attempts: number;
  stage: 'start' | 'success' | 'error' | 'retry';
  status?: number;
  durationMs?: number;
  message?: string;
  startedAt: number;
};

function emitApiTrace(detail: ApiTraceDetail) {
  window.dispatchEvent(new CustomEvent<ApiTraceDetail>(API_TRACE_EVENT, { detail }));
}

export function wakeBackend() {
  if (!API_BASE_URL) return;
  fetch(`${API_BASE_URL}/api/health`, {
    method: 'GET',
    cache: 'no-store',
  }).catch(() => undefined);
}

export function getSessionToken() {
  return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || '';
}

export function getTelegramInitData() {
  return (window as any).Telegram?.WebApp?.initData || '';
}

export function setSessionToken(token: string | null | undefined) {
  if (!token) {
    localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
}

export function buildAuthHeaders(init?: HeadersInit) {
  const token = getSessionToken();
  const telegramInitData = getTelegramInitData();
  return {
    ...(init || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!token && telegramInitData ? { 'x-telegram-init-data': telegramInitData } : {}),
  };
}

export function buildAuthenticatedUrl(path: string) {
  const token = getSessionToken();
  if (!token) {
    const telegramInitData = getTelegramInitData();
    if (!telegramInitData) {
      return `${API_BASE_URL}${path}`;
    }
    const separator = path.includes('?') ? '&' : '?';
    return `${API_BASE_URL}${path}${separator}telegramInitData=${encodeURIComponent(telegramInitData)}`;
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${API_BASE_URL}${path}${separator}sessionToken=${encodeURIComponent(token)}`;
}

type ApiRequestInit = RequestInit & {
  retryOnNetworkError?: boolean;
  timeoutMs?: number;
};

export async function apiRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const { retryOnNetworkError = false, timeoutMs = API_REQUEST_TIMEOUT_MS, ...requestInit } = init || {};
  const attempts = retryOnNetworkError ? 2 : 1;
  const method = (requestInit.method || 'GET').toUpperCase();
  const url = `${API_BASE_URL}${path}`;
  const traceId = `api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timeoutId = 0;
    const attemptStartedAt = Date.now();
    const baseTrace = {
      id: traceId,
      path,
      method,
      url,
      attempt: attempt + 1,
      attempts,
      startedAt,
    };

    try {
      emitApiTrace({ ...baseTrace, stage: 'start' });
      const requestPromise = (async () => {
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            ...buildAuthHeaders(requestInit.headers),
          },
          ...requestInit,
          signal: requestInit.signal ?? controller.signal,
        });
        const rawBody = await response.text();
        const data = rawBody ? JSON.parse(rawBody) : null;
        if (!response.ok) {
          const serverMessage = data?.error || `Request failed with status ${response.status}`;
          emitApiTrace({
            ...baseTrace,
            stage: 'error',
            status: response.status,
            durationMs: Date.now() - attemptStartedAt,
            message: serverMessage,
          });
          throw new Error(`${serverMessage} [${response.status} ${path}]`);
        }
        emitApiTrace({
          ...baseTrace,
          stage: 'success',
          status: response.status,
          durationMs: Date.now() - attemptStartedAt,
        });
        return data as T;
      })();
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();
          reject(new DOMException('Request timed out', 'AbortError'));
        }, timeoutMs);
      });
      return await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      if ((error instanceof TypeError || isTimeout) && attempt + 1 < attempts) {
        emitApiTrace({
          ...baseTrace,
          stage: 'retry',
          durationMs: Date.now() - attemptStartedAt,
          message: isTimeout ? 'Request timed out; retrying.' : 'Network error; retrying.',
        });
        wakeBackend();
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        continue;
      }
      if (isTimeout) {
        emitApiTrace({
          ...baseTrace,
          stage: 'error',
          durationMs: Date.now() - attemptStartedAt,
          message: 'Server response timed out.',
        });
        throw new Error(`Server response timed out. Please try again. [${path}]`);
      }
      if (error instanceof SyntaxError) {
        emitApiTrace({
          ...baseTrace,
          stage: 'error',
          durationMs: Date.now() - attemptStartedAt,
          message: 'Backend returned invalid JSON.',
        });
        throw new Error(`Backend returned an invalid response. [${path}]`);
      }
      if (error instanceof TypeError) {
        emitApiTrace({
          ...baseTrace,
          stage: 'error',
          durationMs: Date.now() - attemptStartedAt,
          message: 'Connection was interrupted.',
        });
        throw new Error(`Connection was interrupted. Check your internet and try again. [${path}]`);
      }
      emitApiTrace({
        ...baseTrace,
        stage: 'error',
        durationMs: Date.now() - attemptStartedAt,
        message: error instanceof Error ? error.message : 'Request failed.',
      });
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error('Request failed.');
}

if (typeof window !== 'undefined') {
  (window as any).redoappActiveLoads = [];
  (window as any).redoappIsAppStarting = true;

  window.addEventListener('redoapp:api-trace', (e: Event) => {
    const detail = (e as CustomEvent<ApiTraceDetail>).detail;
    const { id, path, stage } = detail;

    const pathsWeCareAbout = [
      '/api/users/sync',
      '/api/matchmaker/join',
      '/api/matchmaker/leave',
      '/api/private-rooms/create',
      '/api/private-rooms/join',
    ];

    const isMatchStateSync = path.startsWith('/api/matches/state/');
    const shouldTrack = pathsWeCareAbout.includes(path) || isMatchStateSync;

    if (!shouldTrack) return;

    if (stage === 'start') {
      const current = (window as any).redoappActiveLoads || [];
      if (!current.includes(id)) {
        (window as any).redoappActiveLoads = [...current, id];
      }
      window.dispatchEvent(new CustomEvent('redoapp:loading-change'));
    } else if (stage === 'success' || stage === 'error') {
      const current = (window as any).redoappActiveLoads || [];
      (window as any).redoappActiveLoads = current.filter((x: string) => x !== id);

      if (path === '/api/users/sync' || path.startsWith('/api/matches/state/')) {
        (window as any).redoappIsAppStarting = false;
      }
      window.dispatchEvent(new CustomEvent('redoapp:loading-change'));
    }
  });
}
