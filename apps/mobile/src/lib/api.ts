import type { LevelAids, Level, PublicToken, Tier } from '@gt/engine';
import { Platform } from 'react-native';

/**
 * API base URL. On web the app is served by the same Worker, so relative URLs
 * work and the session is an HttpOnly cookie. On phones the URL comes from
 * EXPO_PUBLIC_API_URL (your Cloudflare preview or your computer's LAN address).
 */
const envUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
const onWeb = Platform.OS === 'web';
/** Web is always same-origin (served by the Worker), so it never needs a base URL. */
export const API_BASE = onWeb ? '' : envUrl;
export const isOnlineConfigured = onWeb || envUrl.length > 0;
export const CLIENT = onWeb ? 'web' : 'native';

let bearer: string | null = null;
export const setBearer = (t: string | null) => {
  bearer = t;
};
export const getBearer = () => bearer;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!isOnlineConfigured) throw new ApiError(0, 'offline', 'No server configured. Practice works offline.');
  const headers: Record<string, string> = { 'x-gt-client': CLIENT };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: CLIENT === 'web' ? 'same-origin' : 'omit',
    });
  } catch {
    throw new ApiError(0, 'network', 'Can’t reach the server. Check your connection.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

export const soundUrl = (ref: string) => `${API_BASE}${ref}`;
export const liveUrl = () => {
  const base = API_BASE || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/^http/, 'ws')}/api/live`;
};

/* ---------------------------- types ---------------------------- */

export type Plan = 'free' | 'coder' | 'host' | 'studio';
export type Status = 'open' | 'active' | 'solved' | 'failed' | 'forfeited' | 'expired' | 'withdrawn';

export interface Entitlements {
  plan: Plan;
  name: string;
  priceMonthly: number;
  maxActive: number;
  maxLevel: number;
  potMultiplier: number;
  lobbyPriority: number;
  perks: string[];
}

export interface Me {
  id: string;
  username: string;
  plan: Plan;
  planUntil: number | null;
  entitlements: Entitlements;
  balance: number;
  escrowed: number;
  unseen: number;
  dailyAvailable: boolean;
  decoder: { rating: number; games: number; tier: Tier };
  coder: { rating: number; games: number; tier: Tier };
  stats: { solved: number; failed: number; winRate: number | null; streak: number; bestStreak: number; avgLevelSolved: number | null; chipsWon: number };
  createdAt: number;
}

export interface Card {
  id: string;
  level: Level;
  levelName: string;
  status: Status;
  pot: number;
  wagered: boolean;
  guessCost: number;
  lives: number;
  shape: number[];
  letterCount: number;
  coder: { username: string; coderRating: number; coderTier: string; plan: Plan; highlighted: boolean };
  decoder: { username: string; rating: number | null; tier: string } | null;
  recipient: { username: string } | null;
  direct: boolean;
  createdAt: number;
  acceptedAt: number | null;
  lastActionAt: number;
  resolvedAt: number | null;
  livesLeft: number;
  actions: number;
}

export interface ChallengeView extends Card {
  role: 'coder' | 'decoder' | 'recipient' | 'viewer';
  revealed: string;
  missed: string;
  wrong: number;
  feesPaid: number;
  seq: number;
  aids: LevelAids;
  tempo: number;
  tokens: PublicToken[] | null;
  message: string | null;
  key: number | null;
  ratingDelta: number | null;
  can: { accept: boolean; guess: boolean; forfeit: boolean; withdraw: boolean };
}

export interface MoveResponse {
  result: { hit: boolean; occurrences: number; fee: number };
  challenge: ChallengeView;
}

export interface LobbyResponse {
  open: Card[];
  live: Card[];
  totals: { open: number; active: number; potsOnTable: number };
  at: number;
}

export interface InboxItem extends Card {
  unseen: boolean;
  role: 'coder' | 'decoder' | 'recipient';
  ratingDelta: number | null;
  feesPaid: number;
}

export interface ConfigResponse {
  levels: { level: Level; name: string; lives: number; guessCost: number; potMin: number; potMax: number; blurb: string; aids: LevelAids; breakEven: { wordSolver: number; staveReader: number } }[];
  plans: Entitlements[];
  chips: { starterGrant: number; dailyGrant: number; rakeBps: number };
  env: string;
}

export interface LedgerEntry {
  id: number;
  tx: string;
  delta: number;
  kind: string;
  challengeId: string | null;
  at: number;
}
