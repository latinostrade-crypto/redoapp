const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const SESSION_TOKEN_STORAGE_KEY = 'redoapp_session_token';

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(init?.headers),
    },
    ...init,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }
  return data as T;
}
