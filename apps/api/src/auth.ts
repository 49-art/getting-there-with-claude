import { CHIPS, MINT, user as userAccount } from '@gt/engine';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { newRecoveryKey, newToken, recoveryHash, sha256Hex, timingSafeEqualHex } from './crypto.ts';
import { classifyBatchError, now, transferStatements } from './db.ts';
import type { AppEnv, Plan, SessionUser } from './env.ts';
import { clientIp, fail, readJson } from './http.ts';
import { effectivePlan } from './plans.ts';
import { rateLimit } from './ratelimit.ts';

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const COOKIE = 'gt_session';
const USERNAME = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const RESERVED = new Set(['admin', 'administrator', 'system', 'support', 'gt', 'getthis', 'get_this', 'house', 'mint', 'escrow', 'root', 'moderator', 'mod', 'staff', 'official', 'anthropic', 'claude', 'null', 'undefined', 'me', 'you']);

export function validateUsername(raw: string): string {
  const name = (raw ?? '').trim();
  if (!USERNAME.test(name)) fail('bad_request', 'Usernames are 3–20 characters: letters, numbers and _, starting with a letter.');
  if (RESERVED.has(name.toLowerCase())) fail('username_taken', 'That username is reserved.');
  return name;
}

/** Web clients get an HttpOnly cookie; native clients get the token in the body. */
const isWeb = (c: Context<AppEnv>) => c.req.header('x-gt-client') === 'web';

function issueSession(c: Context<AppEnv>, token: string) {
  if (isWeb(c)) {
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });
    return {};
  }
  return { token };
}

function sessionStatements(db: D1Database, tokenHash: string, userId: string, label: string | null, at: number) {
  return db
    .prepare('INSERT INTO sessions (token_hash, user_id, label, created_at, last_seen_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5)')
    .bind(tokenHash, userId, label, at, at + SESSION_TTL_MS);
}

/** Resolves the session (if any) for every request. Never throws. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  c.set('token', null);
  const header = c.req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : getCookie(c, COOKIE);
  if (token && token.length >= 40 && token.length <= 64) {
    const hash = await sha256Hex(token);
    const row = await c.env.DB.prepare(
      `SELECT s.user_id, s.expires_at, s.last_seen_at, u.username, u.plan, u.plan_until
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1`,
    )
      .bind(hash)
      .first<{ user_id: string; expires_at: number; last_seen_at: number; username: string; plan: Plan; plan_until: number | null }>();
    const at = now();
    if (row && row.expires_at > at) {
      const sessionUser: SessionUser = { id: row.user_id, username: row.username, plan: effectivePlan(row.plan, row.plan_until, at) };
      c.set('user', sessionUser);
      c.set('token', hash);
      if (at - row.last_seen_at > 60 * 60 * 1000) {
        c.executionCtx.waitUntil(
          c.env.DB.batch([
            c.env.DB.prepare('UPDATE sessions SET last_seen_at = ?1, expires_at = ?2 WHERE token_hash = ?3').bind(at, at + SESSION_TTL_MS, hash),
            c.env.DB.prepare('UPDATE users SET last_active_at = ?1 WHERE id = ?2').bind(at, row.user_id),
          ]),
        );
      }
    }
  }
  await next();
};

/** Blocks cross-site form posts: mutations must carry the custom client header (forces CORS preflight). */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !c.req.header('x-gt-client')) {
    fail('forbidden', 'Missing client header.');
  }
  await next();
};

export function requireUser(c: Context<AppEnv>): SessionUser {
  const u = c.get('user');
  if (!u) return fail('unauthorised', 'Please sign in.');
  return u;
}

export const auth = new Hono<AppEnv>();

auth.get('/available', async (c) => {
  const name = validateUsername(c.req.query('username') ?? '');
  await rateLimit(c.env.DB, `avail:${clientIp(c)}`, 60, 60_000, c.env);
  const row = await c.env.DB.prepare('SELECT 1 FROM users WHERE username_key = ?1').bind(name.toLowerCase()).first();
  return c.json({ username: name, available: !row });
});

auth.post('/register', async (c) => {
  const body = await readJson<{ username?: string; device?: string }>(c);
  const username = validateUsername(body.username ?? '');
  await rateLimit(c.env.DB, `register:${clientIp(c)}`, 8, 60 * 60_000, c.env);
  const id = crypto.randomUUID();
  const recoveryKey = newRecoveryKey();
  const token = newToken();
  const at = now();
  const db = c.env.DB;
  try {
    await db.batch([
      db
        .prepare('INSERT INTO users (id, username, username_key, recovery_hash, created_at, last_active_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)')
        .bind(id, username, username.toLowerCase(), await recoveryHash(c.env.GT_SECRET, recoveryKey), at),
      db.prepare("INSERT INTO accounts (id, kind, balance) VALUES (?1, 'user', 0)").bind(`user:${id}`),
      sessionStatements(db, await sha256Hex(token), id, (body.device ?? '').slice(0, 60) || null, at),
      ...transferStatements(db, crypto.randomUUID(), [{ from: MINT, to: userAccount(id), amount: CHIPS.starterGrant, kind: 'starter_grant' }], null, at),
    ]);
  } catch (err) {
    if (classifyBatchError(err) === 'duplicate') fail('username_taken', 'That username is taken.');
    throw err;
  }
  return c.json({ user: { id, username }, recoveryKey, ...issueSession(c, token) }, 201);
});

auth.post('/signin', async (c) => {
  const body = await readJson<{ username?: string; recoveryKey?: string; device?: string }>(c);
  const username = (body.username ?? '').trim();
  const key = body.recoveryKey ?? '';
  await rateLimit(c.env.DB, `signin:${clientIp(c)}`, 20, 60 * 60_000, c.env);
  await rateLimit(c.env.DB, `signin-user:${username.toLowerCase()}`, 10, 60 * 60_000, c.env);
  const row = await c.env.DB.prepare('SELECT id, username, recovery_hash FROM users WHERE username_key = ?1').bind(username.toLowerCase()).first<{ id: string; username: string; recovery_hash: string }>();
  const candidate = await recoveryHash(c.env.GT_SECRET, key);
  if (!row || !timingSafeEqualHex(candidate, row.recovery_hash)) fail('unauthorised', 'That username and recovery key don’t match.');
  const token = newToken();
  await sessionStatements(c.env.DB, await sha256Hex(token), row!.id, (body.device ?? '').slice(0, 60) || null, now()).run();
  return c.json({ user: { id: row!.id, username: row!.username }, ...issueSession(c, token) });
});

auth.post('/signout', async (c) => {
  const hash = c.get('token');
  if (hash) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(hash).run();
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

auth.post('/rotate-recovery', async (c) => {
  const me = requireUser(c);
  const recoveryKey = newRecoveryKey();
  await c.env.DB.prepare('UPDATE users SET recovery_hash = ?1 WHERE id = ?2').bind(await recoveryHash(c.env.GT_SECRET, recoveryKey), me.id).run();
  return c.json({ recoveryKey });
});
