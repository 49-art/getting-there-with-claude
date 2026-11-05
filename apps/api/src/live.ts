import type { Context } from 'hono';
import type { AppEnv, Env } from './env.ts';

export type LiveMessage =
  | { type: 'lobby'; challengeId?: string }
  | { type: 'scoreboard' }
  | { type: 'challenge'; challengeId: string }
  | { type: 'inbox'; challengeId: string };

/** userId set = deliver to that user's sockets only; unset = everyone. */
export interface LiveEvent {
  userId?: string;
  event: LiveMessage;
}

export function arenaStub(env: Env) {
  return env.ARENA.get(env.ARENA.idFromName('arena'));
}

export function broadcastEnv(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, events: LiveEvent[]): void {
  if (!events.length) return;
  ctx.waitUntil(
    arenaStub(env)
      .fetch('https://arena/broadcast', { method: 'POST', body: JSON.stringify({ events }) })
      .then((r) => r.body?.cancel())
      .catch((err) => console.warn('broadcast failed', String(err))),
  );
}

/** Fire-and-forget fan-out; never delays or fails the API response. */
export function broadcast(c: Context<AppEnv>, events: LiveEvent[]): void {
  broadcastEnv(c.env, c.executionCtx, events);
}
