import { fail } from './http.ts';

/**
 * Fixed-window limiter on D1. One upsert per check; fails closed with 429.
 * Used for sign-in, registration and username search.
 */
export async function rateLimit(db: D1Database, key: string, limit: number, windowMs: number, env?: { GT_ENV?: string }): Promise<void> {
  // Local development shares one IP across every test run; relax the limits there only.
  if (env?.GT_ENV === 'development') limit *= 100;
  const nowMs = Date.now();
  const windowStart = nowMs - (nowMs % windowMs);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = ?2 THEN rate_limits.count + 1 ELSE 1 END,
         window_start = ?2
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit) fail('rate_limited', 'Too many attempts. Please wait a few minutes and try again.');
}
