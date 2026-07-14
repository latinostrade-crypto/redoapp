const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (isLocal ? 'http://localhost:10000' : 'https://yoapp-backend.onrender.com');
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

async function probeBackend(timeoutMs = 5_000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function waitForBackendReady(maxWaitMs: number) {
  const deadline = Date.now() + Math.max(0, maxWaitMs);
  while (Date.now() < deadline) {
    if (await probeBackend()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
  }
  return false;
}

export function isTransientApiError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Connection was interrupted')
    || error.message.includes('Server response timed out');
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
    ...(telegramInitData ? { 'x-telegram-init-data': telegramInitData } : {}),
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
  skipAuthRefresh?: boolean;
  timeoutMs?: number;
};

let sessionRefreshPromise: Promise<boolean> | null = null;

function refreshApiSession(signal?: AbortSignal) {
  if (sessionRefreshPromise) return sessionRefreshPromise;

  sessionRefreshPromise = (async () => {
    const telegramInitData = getTelegramInitData();
    const storedUserId = localStorage.getItem('redoapp_current_user_id') || '';
    const fallbackGuestUserId = storedUserId.startsWith('guest:') ? storedUserId : 'guest:guest';
    const response = await fetch(`${API_BASE_URL}/api/users/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: telegramInitData ? (storedUserId || fallbackGuestUserId) : fallbackGuestUserId,
        walletAddress: localStorage.getItem('redoapp_wallet_address') || null,
        telegramInitData,
        startParam: null,
      }),
      signal,
    });
    if (!response.ok) return false;
    const synced = await response.json() as { userId?: string; sessionToken?: string | null };
    if (!synced.sessionToken) return false;
    setSessionToken(synced.sessionToken);
    if (synced.userId) localStorage.setItem('redoapp_current_user_id', synced.userId);
    return true;
  })().catch(() => false).finally(() => {
    sessionRefreshPromise = null;
  });

  return sessionRefreshPromise;
}

export async function apiRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const { retryOnNetworkError = false, skipAuthRefresh = false, timeoutMs = API_REQUEST_TIMEOUT_MS, ...requestInit } = init || {};
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
        if (response.status === 401 && !skipAuthRefresh && path !== '/api/users/sync') {
          setSessionToken(null);
          const refreshed = await refreshApiSession(controller.signal);
          if (refreshed) {
            // Close this trace before the retried request creates a new one;
            // otherwise the fullscreen loader keeps a permanently active id.
            emitApiTrace({
              ...baseTrace,
              stage: 'error',
              status: 401,
              durationMs: Date.now() - attemptStartedAt,
              message: 'Session refreshed; retrying request.',
            });
            return apiRequest<T>(path, { ...(init || {}), skipAuthRefresh: true });
          }
        }
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
        // A sleeping Render free service can need about a minute to wake. A
        // simple health request avoids CORS preflight and tells us when it is
        // safe to replay an idempotent mutation instead of failing the UI.
        await waitForBackendReady(Math.min(65_000, timeoutMs));
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
      '/api/matchmaker/join',
      '/api/matchmaker/leave',
      '/api/private-rooms/create',
      '/api/private-rooms/join',
    ];

    const isInitialUserSync = path === '/api/users/sync' && ((window as any).redoappIsAppStarting ?? true);
    const isMatchStateSync = path.startsWith('/api/matches/state/');
    const isAlreadyTracked = ((window as any).redoappActiveLoads || []).includes(id);
    const shouldTrack = pathsWeCareAbout.includes(path) || isInitialUserSync || isMatchStateSync || isAlreadyTracked;

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
