const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const SESSION_TOKEN_STORAGE_KEY = 'redoapp_session_token';
// Render free services can take longer than 15 seconds to resume from a cold start.
const API_REQUEST_TIMEOUT_MS = 60000;

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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(init?.headers),
      },
      ...init,
      signal: init?.signal ?? controller.signal,
    });

    const rawBody = await response.text();
    const data = rawBody ? JSON.parse(rawBody) : null;

    if (!response.ok) {
      throw new Error(data?.error || `Request failed with status ${response.status}`);
    }

    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out while waiting for the backend. Render may still be waking up.');
    }
    if (error instanceof SyntaxError) {
      throw new Error('Backend returned an invalid response.');
    }
    if (error instanceof TypeError) {
      throw new Error('Network request failed. Check Render availability, CORS, and Telegram WebApp connectivity.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
