import { CHIPS, LEVELS, MINT, TIERS, levelSpec, parseSampleKey, tierFor, user as userAccount, BREAK_EVEN_POT } from '@gt/engine';
import { Hono } from 'hono';
import { requireUser } from './auth.ts';
import { cardOf, loadChallenge } from './challenges.ts';
import { openSound, randomBytes, timingSafeEqualHex } from './crypto.ts';
import { balanceOf, classifyBatchError, now, transferStatements } from './db.ts';
import type { AppEnv, Plan } from './env.ts';
import { clientIp, fail, readJson } from './http.ts';
import { PLANS, effectivePlan } from './plans.ts';
import { rateLimit } from './ratelimit.ts';

export const routes = new Hono<AppEnv>();

/* ---------------------------- config ---------------------------- */

routes.get('/config', (c) =>
  c.json({
    levels: LEVELS.map((l) => ({ ...l, breakEven: BREAK_EVEN_POT[l.level] })),
    tiers: TIERS,
    plans: Object.values(PLANS),
    chips: { starterGrant: CHIPS.starterGrant, dailyGrant: CHIPS.dailyGrant, rakeBps: Number(c.env.RAKE_BPS) },
    env: c.env.GT_ENV,
  }),
);

/* ---------------------------- me ---------------------------- */

interface MeRow {
  id: string;
  username: string;
  plan: Plan;
  plan_until: number | null;
  decoder_rating: number;
  decoder_games: number;
  coder_rating: number;
  coder_games: number;
  solved: number;
  failed: number;
  streak: number;
  best_streak: number;
  level_sum_solved: number;
  chips_won: number;
  created_at: number;
}

routes.get('/me', async (c) => {
  // ?optional=1 lets a signed-out client check its session without an error response.
  if (!c.get('user') && c.req.query('optional') === '1') return c.json(null);
  const me = requireUser(c);
  const db = c.env.DB;
  const today = new Date().toISOString().slice(0, 10);
  const [u, balance, escrowed, unseen, claimed] = await Promise.all([
    db.prepare('SELECT * FROM users WHERE id = ?1').bind(me.id).first<MeRow>(),
    balanceOf(db, me.id),
    db.prepare("SELECT COALESCE(SUM(pot), 0) AS n FROM challenges WHERE coder_id = ?1 AND status IN ('open', 'active')").bind(me.id).first<{ n: number }>(),
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM challenges WHERE recipient_id = ?1 AND recipient_seen = 0) +
           (SELECT COUNT(*) FROM challenges WHERE coder_id = ?1 AND coder_seen = 0) AS n`,
      )
      .bind(me.id)
      .first<{ n: number }>(),
    db.prepare('SELECT 1 FROM daily_claims WHERE user_id = ?1 AND day = ?2').bind(me.id, today).first(),
  ]);
  if (!u) return fail('unauthorised', 'Please sign in.');
  const plan = effectivePlan(u.plan, u.plan_until);
  return c.json({
    id: u.id,
    username: u.username,
    plan,
    planUntil: u.plan_until,
    entitlements: PLANS[plan],
    balance,
    escrowed: escrowed?.n ?? 0,
    unseen: unseen?.n ?? 0,
    dailyAvailable: !claimed,
    decoder: { rating: u.decoder_rating, games: u.decoder_games, tier: tierFor(u.decoder_rating) },
    coder: { rating: u.coder_rating, games: u.coder_games, tier: tierFor(u.coder_rating) },
    stats: {
      solved: u.solved,
      failed: u.failed,
      winRate: u.solved + u.failed > 0 ? u.solved / (u.solved + u.failed) : null,
      streak: u.streak,
      bestStreak: u.best_streak,
      avgLevelSolved: u.solved > 0 ? u.level_sum_solved / u.solved : null,
      chipsWon: u.chips_won,
    },
    createdAt: u.created_at,
  });
});

/* ---------------------------- bank ---------------------------- */

routes.get('/bank', async (c) => {
  const me = requireUser(c);
  const before = Number(c.req.query('before') ?? 0) || Number.MAX_SAFE_INTEGER;
  const rows = await c.env.DB.prepare(
    'SELECT id, tx_id, delta, kind, challenge_id, created_at FROM ledger WHERE account_id = ?1 AND id < ?2 ORDER BY id DESC LIMIT 40',
  )
    .bind(`user:${me.id}`, before)
    .all<{ id: number; tx_id: string; delta: number; kind: string; challenge_id: string | null; created_at: number }>();
  return c.json({
    balance: await balanceOf(c.env.DB, me.id),
    entries: rows.results.map((r) => ({ id: r.id, tx: r.tx_id, delta: r.delta, kind: r.kind, challengeId: r.challenge_id, at: r.created_at })),
    next: rows.results.length === 40 ? rows.results[rows.results.length - 1]!.id : null,
  });
});

routes.post('/bank/daily', async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const day = new Date().toISOString().slice(0, 10);
  const at = now();
  try {
    await db.batch([
      db.prepare('INSERT INTO daily_claims (user_id, day) VALUES (?1, ?2)').bind(me.id, day),
      ...transferStatements(db, crypto.randomUUID(), [{ from: MINT, to: userAccount(me.id), amount: CHIPS.dailyGrant, kind: 'daily_grant' }], null, at),
    ]);
  } catch (err) {
    if (classifyBatchError(err) === 'duplicate') fail('conflict', 'Already claimed today — come back tomorrow.');
    throw err;
  }
  return c.json({ granted: CHIPS.dailyGrant, balance: await balanceOf(db, me.id) });
});

/* ---------------------------- users ---------------------------- */

routes.get('/users/search', async (c) => {
  const me = requireUser(c);
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  if (q.length < 2 || !/^[a-z0-9_]+$/.test(q)) return c.json({ users: [] });
  await rateLimit(c.env.DB, `search:${me.id}`, 120, 60_000, c.env);
  const rows = await c.env.DB.prepare('SELECT username, decoder_rating FROM users WHERE username_key >= ?1 AND username_key < ?2 AND id != ?3 ORDER BY username_key LIMIT 8')
    .bind(q, `${q}￿`, me.id)
    .all<{ username: string; decoder_rating: number }>();
  return c.json({ users: rows.results.map((r) => ({ username: r.username, tier: tierFor(r.decoder_rating).name })) });
});

routes.get('/users/:username', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE username_key = ?1').bind(c.req.param('username').toLowerCase()).first<MeRow>();
  if (!row) return fail('not_found', 'No such user.');
  return c.json({
    username: row.username,
    plan: effectivePlan(row.plan, row.plan_until),
    decoder: { rating: row.decoder_rating, games: row.decoder_games, tier: tierFor(row.decoder_rating) },
    coder: { rating: row.coder_rating, games: row.coder_games, tier: tierFor(row.coder_rating) },
    stats: { solved: row.solved, failed: row.failed, bestStreak: row.best_streak, chipsWon: row.chips_won },
    since: row.created_at,
  });
});

/* ---------------------------- lobby ---------------------------- */

routes.get('/lobby', async (c) => {
  const at = now();
  const level = Number(c.req.query('level') ?? 0);
  const sort = c.req.query('sort') ?? 'featured';
  const order =
    sort === 'pot'
      ? 'ch.pot DESC, ch.created_at DESC'
      : sort === 'new'
        ? 'ch.created_at DESC'
        : sort === 'level'
          ? 'ch.level DESC, ch.pot DESC'
          : `CASE WHEN cu.plan_until IS NOT NULL AND cu.plan_until < ${at} THEN 0 WHEN cu.plan = 'studio' THEN 2 WHEN cu.plan = 'host' THEN 1 ELSE 0 END DESC, ch.pot DESC, ch.created_at DESC`;
  const levelFilter = level >= 1 && level <= 6 ? `AND ch.level = ${level}` : '';
  const open = await c.env.DB.prepare(
    `SELECT ch.*, cu.username AS coder_name, cu.decoder_rating AS coder_decoder_rating, cu.coder_rating, cu.coder_games, cu.plan AS coder_plan, cu.plan_until AS coder_plan_until,
            NULL AS decoder_name, NULL AS decoder_rating, NULL AS decoder_games, NULL AS recipient_name
       FROM challenges ch JOIN users cu ON cu.id = ch.coder_id
      WHERE ch.status = 'open' AND ch.recipient_id IS NULL ${levelFilter}
      ORDER BY ${order} LIMIT 60`,
  ).all();
  const live = await c.env.DB.prepare(
    `SELECT ch.*, cu.username AS coder_name, cu.decoder_rating AS coder_decoder_rating, cu.coder_rating, cu.coder_games, cu.plan AS coder_plan, cu.plan_until AS coder_plan_until,
            du.username AS decoder_name, du.decoder_rating AS decoder_rating, du.decoder_games AS decoder_games, NULL AS recipient_name
       FROM challenges ch JOIN users cu ON cu.id = ch.coder_id JOIN users du ON du.id = ch.decoder_id
      WHERE ch.status = 'active' AND ch.recipient_id IS NULL
      ORDER BY ch.last_action_at DESC LIMIT 12`,
  ).all();
  const counts = await c.env.DB.prepare("SELECT status, COUNT(*) AS n, COALESCE(SUM(pot), 0) AS pots FROM challenges WHERE status IN ('open', 'active') AND recipient_id IS NULL GROUP BY status").all<{ status: string; n: number; pots: number }>();
  const by = Object.fromEntries(counts.results.map((r) => [r.status, r]));
  return c.json({
    open: open.results.map((r) => cardOf(r as never, at)),
    live: live.results.map((r) => cardOf(r as never, at)),
    totals: { open: by.open?.n ?? 0, active: by.active?.n ?? 0, potsOnTable: (by.open?.pots ?? 0) + (by.active?.pots ?? 0) },
    at,
  });
});

/* ---------------------------- inbox ---------------------------- */

routes.get('/inbox', async (c) => {
  const me = requireUser(c);
  const box = c.req.query('box') === 'sent' ? 'sent' : 'received';
  const where = box === 'sent' ? 'ch.coder_id = ?1' : '(ch.recipient_id = ?1 OR ch.decoder_id = ?1) AND ch.coder_id != ?1';
  const rows = await c.env.DB.prepare(
    `SELECT ch.*, cu.username AS coder_name, cu.decoder_rating AS coder_decoder_rating, cu.coder_rating, cu.coder_games, cu.plan AS coder_plan, cu.plan_until AS coder_plan_until,
            du.username AS decoder_name, du.decoder_rating AS decoder_rating, du.decoder_games AS decoder_games, ru.username AS recipient_name
       FROM challenges ch
       JOIN users cu ON cu.id = ch.coder_id
       LEFT JOIN users du ON du.id = ch.decoder_id
       LEFT JOIN users ru ON ru.id = ch.recipient_id
      WHERE ${where}
      ORDER BY COALESCE(ch.resolved_at, ch.last_action_at) DESC LIMIT 60`,
  )
    .bind(me.id)
    .all<Record<string, unknown>>();
  return c.json({
    box,
    items: rows.results.map((r) => ({
      ...cardOf(r as never),
      unseen: box === 'sent' ? r.coder_seen === 0 : r.recipient_id === me.id && r.recipient_seen === 0,
      role: box === 'sent' ? 'coder' : r.decoder_id === me.id ? 'decoder' : 'recipient',
      ratingDelta: box === 'sent' ? r.coder_rating_delta : r.decoder_rating_delta,
      feesPaid: r.fees_paid,
    })),
  });
});

/* ---------------------------- scoreboard ---------------------------- */

routes.get('/scoreboard', async (c) => {
  const view = c.req.query('view') ?? 'decoders';
  const db = c.env.DB;
  if (view === 'coders') {
    const rows = await db.prepare(
      `SELECT u.username, u.coder_rating AS rating, u.coder_games AS games,
              (SELECT COUNT(*) FROM challenges ch WHERE ch.coder_id = u.id AND ch.status = 'solved' AND ch.pot > 0 AND ch.recipient_id IS NULL) AS solved_against,
              (SELECT COALESCE(SUM(fees_paid), 0) FROM challenges ch WHERE ch.coder_id = u.id AND ch.recipient_id IS NULL) AS fees
         FROM users u WHERE u.coder_games > 0 ORDER BY u.coder_rating DESC, u.coder_games DESC LIMIT 50`,
    ).all<{ username: string; rating: number; games: number; solved_against: number; fees: number }>();
    return c.json({
      view,
      rows: rows.results.map((r, i) => ({ rank: i + 1, username: r.username, rating: r.rating, tier: tierFor(r.rating).name, games: r.games, solveRateAgainst: r.games ? r.solved_against / r.games : null, feesEarned: r.fees })),
    });
  }
  if (view === 'week' || /^level[1-6]$/.test(view)) {
    const level = view.startsWith('level') ? Number(view.slice(5)) : null;
    const since = view === 'week' ? now() - 7 * 24 * 60 * 60 * 1000 : 0;
    const rows = await db.prepare(
      `SELECT u.username, u.decoder_rating AS rating, COUNT(*) AS solves, COALESCE(SUM(ch.pot), 0) AS pots, MAX(ch.level) AS top_level
         FROM challenges ch JOIN users u ON u.id = ch.decoder_id
        WHERE ch.status = 'solved' AND ch.pot > 0 AND ch.recipient_id IS NULL AND ch.resolved_at >= ?1 ${level ? 'AND ch.level = ?2' : ''}
        GROUP BY ch.decoder_id ORDER BY solves DESC, pots DESC LIMIT 50`,
    )
      .bind(since, ...(level ? [level] : []))
      .all<{ username: string; rating: number; solves: number; pots: number; top_level: number }>();
    return c.json({
      view,
      level,
      levelName: level ? levelSpec(level).name : null,
      rows: rows.results.map((r, i) => ({ rank: i + 1, username: r.username, rating: r.rating, tier: tierFor(r.rating).name, solves: r.solves, potsWon: r.pots, topLevel: r.top_level })),
    });
  }
  const rows = await db.prepare(
    `SELECT username, decoder_rating AS rating, decoder_games AS games, solved, failed, streak, best_streak, level_sum_solved, chips_won, last_active_at
       FROM users WHERE decoder_games > 0 ORDER BY decoder_rating DESC, solved DESC LIMIT 50`,
  ).all<{ username: string; rating: number; games: number; solved: number; failed: number; streak: number; best_streak: number; level_sum_solved: number; chips_won: number; last_active_at: number }>();
  return c.json({
    view: 'decoders',
    rows: rows.results.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      rating: r.rating,
      tier: tierFor(r.rating).name,
      solved: r.solved,
      games: r.games,
      winRate: r.solved + r.failed ? r.solved / (r.solved + r.failed) : null,
      avgLevel: r.solved ? r.level_sum_solved / r.solved : null,
      streak: r.streak,
      bestStreak: r.best_streak,
      chipsWon: r.chips_won,
      lastActive: r.last_active_at,
    })),
  });
});

/* ---------------------------- sounds ---------------------------- */

/**
 * Serves a note's audio for an opaque token. The token hides which instrument
 * and pitch it is; random silent padding makes the bytes differ per request so
 * files can't be fingerprinted by hash.
 */
routes.get('/sound/:token', async (c) => {
  const plain = await openSound(c.env.GT_SECRET, c.req.param('token'));
  const [challengeId, , inst, midi] = plain?.split('|') ?? [];
  const id = challengeId && inst && midi ? parseSampleKey(`${inst}_${midi}`) : null;
  if (!id) return fail('not_found', 'Unknown sound.');
  const asset = await c.env.ASSETS.fetch(new Request(new URL(`/sounds/${id.inst}_${id.midi}.wav`, c.req.url)));
  if (!asset.ok) return fail('not_found', 'Sound file missing.');
  const wav = new Uint8Array(await asset.arrayBuffer());
  return new Response(padWav(wav), {
    headers: { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' },
  });
});

function padWav(wav: Uint8Array): Uint8Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  if (wav.byteLength < 44 || view.getUint32(36, false) !== 0x64617461) return wav; // 'data'
  const r = randomBytes(2);
  const lead = (r[0]! % 48) * 2;
  const tail = (r[1]! % 48) * 2;
  const dataLen = view.getUint32(40, true);
  const out = new Uint8Array(44 + lead + dataLen + tail);
  out.set(wav.subarray(0, 44), 0);
  out.set(wav.subarray(44, 44 + dataLen), 44 + lead);
  const ov = new DataView(out.buffer);
  ov.setUint32(4, 36 + lead + dataLen + tail, true);
  ov.setUint32(40, lead + dataLen + tail, true);
  return out;
}

/* ---------------------------- plans / admin ---------------------------- */

routes.post('/admin/plan', async (c) => {
  const token = c.env.ADMIN_TOKEN;
  const given = c.req.header('authorization')?.replace(/^Bearer /, '') ?? '';
  await rateLimit(c.env.DB, `admin:${clientIp(c)}`, 30, 60 * 60_000, c.env);
  if (!token || token.length < 24 || !timingSafeEqualHex(given, token)) return fail('forbidden', 'Admin access is not enabled.');
  const body = await readJson<{ username?: string; plan?: Plan; days?: number | null }>(c);
  if (!body.plan || !(body.plan in PLANS)) fail('bad_request', 'plan must be free, coder, host or studio.');
  const until = body.days ? now() + Number(body.days) * 24 * 60 * 60 * 1000 : null;
  const r = await c.env.DB.prepare('UPDATE users SET plan = ?1, plan_until = ?2 WHERE username_key = ?3').bind(body.plan, until, String(body.username ?? '').toLowerCase()).run();
  if (!r.meta.changes) fail('not_found', 'No such user.');
  return c.json({ ok: true, username: body.username, plan: body.plan, planUntil: until });
});

/* ---------------------------- health ---------------------------- */

routes.get('/health', async (c) => {
  const ledger = await c.env.DB.prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM accounts').first<{ total: number }>();
  return c.json({ ok: true, env: c.env.GT_ENV, ledgerBalanced: (ledger?.total ?? 0) === 0, at: now() });
});

export { loadChallenge };
