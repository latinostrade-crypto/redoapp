const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const SESSION_TOKEN_STORAGE_KEY = 'redoapp_session_token';
// Render documents an approximately one-minute wake-up for idle free services.
const API_REQUEST_TIMEOUT_MS = 90000;

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

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timeoutId = 0;

    try {
      const fetchPromise = fetch(`${API_BASE_URL}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(requestInit.headers),
        },
        ...requestInit,
        signal: requestInit.signal ?? controller.signal,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();
          reject(new DOMException('Request timed out', 'AbortError'));
        }, timeoutMs);
      });
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      const rawBody = await response.text();
      const data = rawBody ? JSON.parse(rawBody) : null;

      if (!response.ok) {
        throw new Error(data?.error || `Request failed with status ${response.status}`);
      }

      return data as T;
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      if ((error instanceof TypeError || isTimeout) && attempt + 1 < attempts) {
        wakeBackend();
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        continue;
      }
      if (isTimeout) {
        throw new Error('Server response timed out. Please try again.');
      }
      if (error instanceof SyntaxError) {
        throw new Error('Backend returned an invalid response.');
      }
      if (error instanceof TypeError) {
        throw new Error('Connection was interrupted. Check your internet and try again.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error('Request failed.');
}

type FormValue = string | number | null | undefined;

export async function apiFormRequest<T>(
  path: string,
  values: Record<string, FormValue>,
  options: { timeoutMs?: number; attempts?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const attempts = options.attempts ?? 2;
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined) body.set(key, String(value));
  });

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timeoutId = 0;
    try {
      const fetchPromise = fetch(buildAuthenticatedUrl(path), {
        method: 'POST',
        body,
        cache: 'no-store',
        signal: controller.signal,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();
          reject(new DOMException('Request timed out', 'AbortError'));
        }, timeoutMs);
      });
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      const rawBody = await response.text();
      const data = rawBody ? JSON.parse(rawBody) : null;
      if (!response.ok) throw new Error(data?.error || `Request failed with status ${response.status}`);
      return data as T;
    } catch (error) {
      const retryable = error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError');
      if (retryable && attempt + 1 < attempts) {
        wakeBackend();
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        continue;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Room creation timed out. Please try again.');
      }
      if (error instanceof TypeError) {
        throw new Error('Connection was interrupted. Please try again.');
      }
      if (error instanceof SyntaxError) {
        throw new Error('Backend returned an invalid response.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error('Could not create room.');
}
