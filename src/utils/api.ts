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

class RetryableFormRequestError extends Error {}

function formRequestAttempt<T>(path: string, body: URLSearchParams, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdogId);
      callback();
    };
    const watchdogId = window.setTimeout(() => {
      xhr.abort();
      finish(() => reject(new RetryableFormRequestError('Room request timed out.')));
    }, timeoutMs);

    xhr.open('POST', buildAuthenticatedUrl(path), true);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
    xhr.onload = () => finish(() => {
      try {
        const data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(data?.error || `Request failed with status ${xhr.status}`));
          return;
        }
        resolve(data as T);
      } catch (error) {
        reject(error instanceof SyntaxError ? new Error('Backend returned an invalid response.') : error);
      }
    });
    xhr.onerror = () => finish(() => reject(new RetryableFormRequestError('Connection was interrupted.')));
    xhr.ontimeout = () => finish(() => reject(new RetryableFormRequestError('Room request timed out.')));
    xhr.onabort = () => finish(() => reject(new RetryableFormRequestError('Room request was interrupted.')));
    xhr.send(body.toString());
  });
}

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
    try {
      return await formRequestAttempt<T>(path, body, timeoutMs);
    } catch (error) {
      if (error instanceof RetryableFormRequestError && attempt + 1 < attempts) {
        wakeBackend();
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        continue;
      }
      if (error instanceof RetryableFormRequestError) {
        throw new Error(`${error.message} Please try again.`);
      }
      throw error;
    }
  }

  throw new Error('Could not create room.');
}
