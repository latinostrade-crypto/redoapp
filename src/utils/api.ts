export const isLocal = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.startsWith('192.168.') ||
  window.location.hostname.startsWith('10.') ||
  window.location.hostname.startsWith('172.') ||
  window.location.hostname.endsWith('.local')
);
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (
  isLocal && typeof window !== 'undefined' ? `http://${window.location.hostname}:10000` : 'https://yoapp-backend.onrender.com'
);
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
  if (typeof window !== 'undefined') {
    const tabToken = sessionStorage.getItem('redoapp_tab_session_token');
    if (tabToken) return tabToken;
  }
  return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || '';
}

export function getTelegramInitData() {
  return (window as any).Telegram?.WebApp?.initData || '';
}

export function setSessionToken(token: string | null | undefined) {
  if (!token) {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('redoapp_tab_session_token');
    }
    localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    return;
  }
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('redoapp_tab_session_token', token);
  }
  localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
}

export function normalizeUserIdentifier(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/^tg[:_]/, '').replace(/^guest[:_]/, '');
}

export function isSameUser(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return normalizeUserIdentifier(a) === normalizeUserIdentifier(b);
}

export function buildAuthHeaders(init?: HeadersInit) {
  const token = getSessionToken();
  const telegramInitData = getTelegramInitData();
  const storedUserId = typeof window !== 'undefined'
    ? (sessionStorage.getItem('redoapp_tab_guest_id') || localStorage.getItem('redoapp_current_user_id') || localStorage.getItem('redoapp_guest_user_id') || '')
    : '';
  return {
    ...(init || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(telegramInitData ? { 'x-telegram-init-data': telegramInitData } : {}),
    ...(storedUserId ? { 'x-user-id': storedUserId } : {}),
  };
}

export function buildAuthenticatedUrl(path: string, extraParams?: URLSearchParams | Record<string, string>) {
  const token = getSessionToken();
  const telegramInitData = getTelegramInitData();
  const storedUserId = typeof window !== 'undefined'
    ? (sessionStorage.getItem('redoapp_tab_guest_id') || localStorage.getItem('redoapp_current_user_id') || localStorage.getItem('redoapp_guest_user_id') || '')
    : '';
  const params = new URLSearchParams();
  if (extraParams) {
    if (extraParams instanceof URLSearchParams) {
      extraParams.forEach((val, key) => params.set(key, val));
    } else {
      Object.entries(extraParams).forEach(([key, val]) => {
        if (val !== undefined && val !== null) params.set(key, String(val));
      });
    }
  }
  if (telegramInitData && !params.has('telegramInitData')) params.set('telegramInitData', telegramInitData);
  if (token && !params.has('sessionToken')) params.set('sessionToken', token);
  if (storedUserId && !params.has('userId')) params.set('userId', storedUserId);
  const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
  const isSameOriginRewrite = path.startsWith('/match-api/');
  const targetUrl = isAbsolute || isSameOriginRewrite
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!params.size) return targetUrl;
  const separator = targetUrl.includes('?') ? '&' : '?';
  return `${targetUrl}${separator}${params.toString()}`;
}

type ApiRequestInit = RequestInit & {
  retryOnNetworkError?: boolean;
  networkAttempts?: number;
  skipAuthRefresh?: boolean;
  timeoutMs?: number;
};

let sessionRefreshPromise: Promise<boolean> | null = null;

function refreshApiSession(signal?: AbortSignal) {
  if (sessionRefreshPromise) return sessionRefreshPromise;

  sessionRefreshPromise = (async () => {
    const telegramInitData = getTelegramInitData();
    const storedUserId = (typeof window !== 'undefined' ? sessionStorage.getItem('redoapp_tab_guest_id') : '') || localStorage.getItem('redoapp_current_user_id') || localStorage.getItem('redoapp_guest_user_id') || '';
    const fallbackGuestUserId = storedUserId || 'guest:guest';
    const currentSessionToken = getSessionToken();
    const response = await fetch(`${API_BASE_URL}/api/users/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentSessionToken ? { Authorization: `Bearer ${currentSessionToken}` } : {}),
        ...(storedUserId ? { 'x-user-id': storedUserId } : {}),
      },
      body: JSON.stringify({
        userId: telegramInitData ? (storedUserId || fallbackGuestUserId) : fallbackGuestUserId,
        walletAddress: localStorage.getItem('redoapp_wallet_address') || null,
        telegramInitData,
        sessionToken: currentSessionToken || null,
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
  const { retryOnNetworkError = false, networkAttempts = 2, skipAuthRefresh = false, timeoutMs = API_REQUEST_TIMEOUT_MS, ...requestInit } = init || {};
  const attempts = retryOnNetworkError ? Math.max(1, Math.min(3, networkAttempts)) : 1;
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
          } else {
            setSessionToken(null);
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

    // Public matchmaking has its own persistent queue card with status,
    // Public matchmaking and private rooms have their own persistent queue cards,
    // timers, and interactive status buttons. Treating them as an app-wide
    // load hid the entire UI behind a blank loading screen when instances were slow.
    const pathsWeCareAbout: string[] = [];

    const isInitialUserSync = path === '/api/users/sync' && ((window as any).redoappIsAppStarting ?? true);
    const isMatchStateSync = path.startsWith('/api/matches/state/') && ((window as any).redoappIsAppStarting ?? true);
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

      // Any finished API call clears the initial app starting screen
      (window as any).redoappIsAppStarting = false;
      window.dispatchEvent(new CustomEvent('redoapp:loading-change'));
    }
  });
}

export function isUserAdmin(profileUsername?: string): boolean {
  if (typeof window === 'undefined') return false;
  const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  const matchesId = tgUser?.id ? String(tgUser.id) === '5152039743' : false;
  const matchesTgUsername = tgUser?.username ? tgUser.username.toLowerCase() === 'allin_gram' : false;
  const matchesProfileUsername = profileUsername ? profileUsername.toLowerCase().replace(/^@/, '') === 'allin_gram' : false;
  return matchesId || matchesTgUsername || matchesProfileUsername;
}

export function cleanErrorMessage(error: unknown, context?: 'bootstrap' | 'matchmaker' | 'private-room'): string {
  if (!error) return '';
  const message = error instanceof Error ? error.message : String(error);
  const cleanMsg = message.replace(/\s*\[[^\]]+\]/g, '').trim();

  if (isUserAdmin()) {
    return cleanMsg || message;
  }
  
  if (
    cleanMsg.includes('energy') ||
    cleanMsg.includes('ticket') ||
    cleanMsg.includes('stake') ||
    cleanMsg.includes('expired') ||
    cleanMsg.includes('cancelled') ||
    cleanMsg.includes('syncing') ||
    cleanMsg.includes('wallet') ||
    cleanMsg.includes('Not enough') ||
    cleanMsg.includes('Insufficient')
  ) {
    return cleanMsg;
  }

  if (context === 'bootstrap') {
    return 'Failed to connect to the game server. Please try again.';
  }

  if (
    cleanMsg.includes('failed with status') || 
    cleanMsg.includes('Request failed') || 
    cleanMsg.includes('invalid JSON') || 
    cleanMsg.includes('invalid response') ||
    cleanMsg.includes('Failed to fetch') ||
    cleanMsg.includes('NetworkError')
  ) {
    return 'Something went wrong. Please check your connection and try again.';
  }
  
  return cleanMsg || 'Matchmaking request failed. Please try again.';
}

