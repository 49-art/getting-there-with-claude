import type { Arena } from './arena.ts';

export interface Env {
  DB: D1Database;
  ARENA: DurableObjectNamespace<Arena>;
  ASSETS: Fetcher;
  /** One high-entropy secret; every key is derived from it with HKDF. */
  GT_SECRET: string;
  /** Optional: enables the admin plan endpoint when set. */
  ADMIN_TOKEN?: string;
  GT_ENV: 'production' | 'preview' | 'development';
  RAKE_BPS: string;
}

export interface SessionUser {
  id: string;
  username: string;
  plan: Plan;
}

export type Plan = 'free' | 'coder' | 'host' | 'studio';

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser | null; token: string | null } };
