/* src/utils/matchmaking.ts */
/**
 * Matchmaking service utilities.
 * Provides simple wrappers around the backend match API for UNO, Poker and Blackjack.
 * If the backend endpoints are unavailable, it falls back to an in‑memory mock
 * implementation (useful for local development without a server). The functions
 * return objects compatible with the existing `redoapp_active_match` schema.
 */
import { apiRequest } from './api';

// Simple in‑memory store for mock matches (fallback when backend unreachable)
interface MockMatch {
  matchId: string;
  mode: 'pvp' | 'private';
  gameType: string;
  stake: number;
  players: string[]; // userIds
  createdAt: number;
}
const mockStore: Record<string, MockMatch> = {};

/** Generate a short random id */
const genId = () => `m-${Math.random().toString(36).slice(2, 9)}`;

/** Create a public (blind) match */
export async function createPublicMatch(
  gameType: string,
  stake: number,
  mode: 'pvp' | 'offline' = 'pvp'
): Promise<{ matchId: string; joinUrl: string }> {
  try {
    const result = await apiRequest<
      { matchId: string; joinUrl: string } |
        { error?: string }
    >(`/api/matches/create`, {
      method: 'POST',
      body: JSON.stringify({ gameType, stake, mode: 'pvp' }),
    });
    if ('matchId' in result) return result;
    throw new Error((result as any).error || 'unknown');
  } catch {
    // Fallback to mock implementation
    const matchId = genId();
    const joinUrl = `${window.location.origin}?play=1&matchId=${matchId}`;
    mockStore[matchId] = {
      matchId,
      mode: 'pvp',
      gameType,
      stake,
      players: [],
      createdAt: Date.now(),
    };
    return { matchId, joinUrl };
  }
}

/** Create a private match (room code) */
export async function createPrivateMatch(
  gameType: string,
  stake: number,
  roomCode: string
): Promise<{ matchId: string; inviteUrl: string }> {
  try {
    const result = await apiRequest<
      { matchId: string; inviteUrl: string } |
        { error?: string }
    >(`/api/matches/create`, {
      method: 'POST',
      body: JSON.stringify({ gameType, stake, mode: 'private', roomCode }),
    });
    if ('matchId' in result) return result;
    throw new Error((result as any).error || 'unknown');
  } catch {
    const matchId = genId();
    const inviteUrl = `${window.location.origin}?room=${encodeURIComponent(
      roomCode
    )}&matchId=${matchId}`;
    mockStore[matchId] = {
      matchId,
      mode: 'private',
      gameType,
      stake,
      players: [],
      createdAt: Date.now(),
    };
    return { matchId, inviteUrl };
  }
}

/** Join an existing match */
export async function joinMatch(
  matchId: string,
  userId: string = 'player'
): Promise<
  | { success: true; state: any }
  | { success: false; error: string }
> {
  try {
    const result = await apiRequest<any>(
      `/api/matches/join/${encodeURIComponent(matchId)}`,
      { method: 'POST', body: JSON.stringify({ userId }) }
    );
    return { success: true, state: result };
  } catch (e) {
    // Mock fallback – just return empty state if match exists
    if (mockStore[matchId]) {
      return { success: true, state: {} };
    }
    return { success: false, error: (e as Error).message };
  }
}

/** Helper to clear stored match when finished or cancelled */
export function clearMatch(matchId: string) {
  delete mockStore[matchId];
  try {
    const raw = localStorage.getItem('redoapp_active_match');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.matchId === matchId) {
        localStorage.removeItem('redoapp_active_match');
      }
    }
  } catch {}
}
