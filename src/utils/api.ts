const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://yoapp-backend.onrender.com';
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
      const requestPromise = (async () => {
        const response = await fetch(`${API_BASE_URL}${path}`, {
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
          throw new Error(`${serverMessage} [${response.status} ${path}]`);
        }
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
        wakeBackend();
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        continue;
      }
      if (isTimeout) {
        throw new Error(`Server response timed out. Please try again. [${path}]`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Backend returned an invalid response. [${path}]`);
      }
      if (error instanceof TypeError) {
        throw new Error(`Connection was interrupted. Check your internet and try again. [${path}]`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error('Request failed.');
}
