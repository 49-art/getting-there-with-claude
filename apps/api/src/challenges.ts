import {
  KEY_COUNT,
  applyGuess,
  applySolve,
  buildScore,
  checkPot,
  describeError,
  escrow,
  feeTransfers,
  levelSpec,
  letterCount,
  livesLeft,
  projectScore,
  rakeOf,
  rateChallenge,
  settlementTransfers,
  tierFor,
  user as userAccount,
  validateMessage,
  voiceEntropyBytes,
  voicesFromBytes,
  type GameState,
  type Instrument,
  type Level,
  type MoveResult,
  type PublicToken,
  type Resolution,
  type Transfer,
} from '@gt/engine';
import { Hono, type Context } from 'hono';
import { requireUser } from './auth.ts';
import { openJson, randomBytes, sealJson, sealSound } from './crypto.ts';
import { accountId, balanceOf, classifyBatchError, now, transferStatements } from './db.ts';
import { isWord } from './dictionary.ts';
import type { AppEnv, Env, Plan } from './env.ts';
import { fail, readJson } from './http.ts';
import { broadcast, type LiveEvent } from './live.ts';
import { PLANS, effectivePlan } from './plans.ts';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ChallengeStatus = 'open' | 'active' | 'solved' | 'failed' | 'forfeited' | 'expired' | 'withdrawn';

interface Secret {
  /** Normalised message. */
  m: string;
  /** Key 0–11. */
  k: number;
  /** Keyed voices for levels 4–6, else null. */
  v: Instrument[] | null;
}

export interface ChallengeRow {
  id: string;
  coder_id: string;
  recipient_id: string | null;
  decoder_id: string | null;
  level: Level;
  status: ChallengeStatus;
  pot: number;
  guess_cost: number;
  lives: number;
  secret: string;
  shape: string;
  letter_count: number;
  seq: number;
  revealed: string;
  missed: string;
  wrong: number;
  actions: number;
  fees_paid: number;
  decoder_rating_delta: number | null;
  coder_rating_delta: number | null;
  coder_seen: number;
  recipient_seen: number;
  created_at: number;
  accepted_at: number | null;
  last_action_at: number;
  resolved_at: number | null;
}

interface PartyRow {
  coder_name: string;
  coder_decoder_rating: number;
  coder_rating: number;
  coder_games: number;
  coder_plan: Plan;
  coder_plan_until: number | null;
  decoder_name: string | null;
  decoder_rating: number | null;
  decoder_games: number | null;
  recipient_name: string | null;
}

type FullRow = ChallengeRow & PartyRow;

const SELECT_FULL = `
  SELECT ch.*,
         cu.username AS coder_name, cu.decoder_rating AS coder_decoder_rating, cu.coder_rating AS coder_rating,
         cu.coder_games AS coder_games, cu.plan AS coder_plan, cu.plan_until AS coder_plan_until,
         du.username AS decoder_name, du.decoder_rating AS decoder_rating, du.decoder_games AS decoder_games,
         ru.username AS recipient_name
    FROM challenges ch
    JOIN users cu ON cu.id = ch.coder_id
    LEFT JOIN users du ON du.id = ch.decoder_id
    LEFT JOIN users ru ON ru.id = ch.recipient_id`;

const RESOLVED: ReadonlySet<ChallengeStatus> = new Set(['solved', 'failed', 'forfeited', 'expired', 'withdrawn']);
const MAX_ACTIVE_DECODES = 5;
const MIN_ACTION_GAP_MS = 600;
export const ACTIVE_TIMEOUT_MS = 72 * 60 * 60 * 1000;
export const OPEN_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

const rakeBps = (env: Env) => {
  const n = Number(env.RAKE_BPS);
  return Number.isInteger(n) && n >= 0 && n <= 2000 ? n : 500;
};

export async function loadChallenge(db: D1Database, id: string): Promise<FullRow | null> {
  return db.prepare(`${SELECT_FULL} WHERE ch.id = ?1`).bind(id).first<FullRow>();
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

type Role = 'coder' | 'decoder' | 'recipient' | 'viewer';

function roleOf(row: ChallengeRow, userId: string | null): Role {
  if (!userId) return 'viewer';
  if (row.coder_id === userId) return 'coder';
  if (row.decoder_id === userId) return 'decoder';
  if (row.recipient_id === userId) return 'recipient';
  return 'viewer';
}

const stateOf = (row: ChallengeRow): GameState => ({
  revealed: row.revealed,
  missed: row.missed,
  wrong: row.wrong,
  actions: row.actions,
  status: row.status === 'solved' ? 'solved' : row.status === 'active' || row.status === 'open' ? 'active' : 'failed',
});

export function cardOf(row: FullRow, at = now()) {
  const spec = levelSpec(row.level);
  const plan = effectivePlan(row.coder_plan, row.coder_plan_until, at);
  return {
    id: row.id,
    level: row.level,
    levelName: spec.name,
    status: row.status,
    pot: row.pot,
    wagered: row.pot > 0,
    guessCost: row.guess_cost,
    lives: row.lives,
    shape: JSON.parse(row.shape) as number[],
    letterCount: row.letter_count,
    coder: {
      username: row.coder_name,
      coderRating: row.coder_rating,
      coderTier: tierFor(row.coder_rating).name,
      plan,
      highlighted: PLANS[plan].lobbyPriority > 0,
    },
    decoder: row.decoder_name ? { username: row.decoder_name, rating: row.decoder_rating, tier: tierFor(row.decoder_rating ?? 1200).name } : null,
    recipient: row.recipient_name ? { username: row.recipient_name } : null,
    direct: row.recipient_id !== null,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    lastActionAt: row.last_action_at,
    resolvedAt: row.resolved_at,
    livesLeft: Math.max(0, row.lives - row.wrong),
    actions: row.actions,
  };
}

async function viewOf(env: Env, row: FullRow, userId: string | null) {
  const role = roleOf(row, userId);
  const card = cardOf(row);
  const spec = levelSpec(row.level);
  const resolved = RESOLVED.has(row.status);
  const involved = role !== 'viewer';
  const canSeeScore = role === 'coder' || (role === 'decoder' && row.status !== 'open') || (resolved && involved && row.decoder_id !== null);
  let tokens: PublicToken[] | null = null;
  let message: string | null = null;
  let key: number | null = null;
  if (canSeeScore) {
    const secret = await openJson<Secret>(env.GT_SECRET, row.secret);
    const score = buildScore(secret.m, secret.k, row.level, secret.v ?? undefined);
    const full = role === 'coder' || resolved;
    const refs = new Map<string, string>();
    for (const t of score.tokens) {
      if (t.kind === 'space') continue;
      refs.set(`${t.index}`, await sealSound(env.GT_SECRET, `${row.id}|${t.index}|${t.inst}|${t.sounding}`));
    }
    tokens = projectScore(score, stateOf(row), {
      full,
      soundRef: (_inst, _midi, index) => `/api/sound/${refs.get(`${index}`)}`,
    });
    if (full) {
      message = secret.m;
      key = secret.k;
    }
  }
  return {
    ...card,
    role,
    revealed: row.revealed,
    missed: row.missed,
    wrong: row.wrong,
    feesPaid: row.fees_paid,
    seq: row.seq,
    aids: spec.aids,
    tempo: spec.tempo,
    tokens,
    message,
    key,
    ratingDelta: role === 'coder' ? row.coder_rating_delta : row.decoder_rating_delta,
    can: {
      accept: row.status === 'open' && role !== 'coder' && (row.recipient_id === null || role === 'recipient') && userId !== null,
      guess: row.status === 'active' && role === 'decoder',
      forfeit: row.status === 'active' && role === 'decoder',
      withdraw: row.status === 'open' && role === 'coder',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Guarded state transitions                                           */
/* ------------------------------------------------------------------ */

interface Transition {
  kind: string;
  actorId: string | null;
  data?: unknown;
  /** Column updates for the challenge row (seq is added automatically). */
  set: Record<string, string | number | null>;
  transfers: Transfer[];
  extra?: D1PreparedStatement[];
}

/**
 * Apply one transition atomically. The event insert takes seq+1; a concurrent
 * transition that got there first makes this insert violate the primary key and
 * the whole batch (including chip movements) rolls back.
 */
async function commit(env: Env, row: ChallengeRow, t: Transition): Promise<void> {
  const db = env.DB;
  const at = now();
  const nextSeq = row.seq + 1;
  const cols = Object.keys(t.set);
  const assignments = cols.map((col, i) => `${col} = ?${i + 3}`).join(', ');
  const stmts: D1PreparedStatement[] = [
    db
      .prepare('INSERT INTO challenge_events (challenge_id, seq, kind, actor_id, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(row.id, nextSeq, t.kind, t.actorId, t.data === undefined ? null : JSON.stringify(t.data), at),
    db.prepare(`UPDATE challenges SET seq = ?2${cols.length ? `, ${assignments}` : ''} WHERE id = ?1 AND seq = ?${cols.length + 3}`).bind(row.id, nextSeq, ...cols.map((c) => t.set[c]!), row.seq),
    ...transferStatements(db, crypto.randomUUID(), t.transfers, row.id, at),
    ...(t.extra ?? []),
  ];
  try {
    await db.batch(stmts);
  } catch (err) {
    const kind = classifyBatchError(err);
    if (kind === 'conflict') fail('conflict', 'This challenge just changed. Refresh and try again.');
    if (kind === 'insufficient_chips') fail('insufficient_chips', 'Not enough chips for that.');
    throw err;
  }
}

/** Resolution side effects: escrow settlement, stats and (for lobby challenges) ratings. */
function resolutionEffects(env: Env, row: FullRow, resolution: Resolution, at: number) {
  const db = env.DB;
  const transfers = settlementTransfers(resolution, row.id, row.pot, row.coder_id, row.decoder_id, rakeBps(env));
  const extra: D1PreparedStatement[] = [];
  const set: Record<string, string | number | null> = { status: resolution, resolved_at: at, coder_seen: 0 };
  const rated = row.pot > 0 && row.recipient_id === null && row.decoder_id !== null && resolution !== 'withdrawn';
  // Ratings and scoreboard stats count only wagered lobby challenges that a
  // decoder actually played. Direct challenges between friends move chips but
  // never ratings, which closes the easiest rating-farming route (D-016).
  if (rated && row.decoder_id && row.status === 'active') {
    const solved = resolution === 'solved';
    const won = solved ? row.pot - rakeOf(row.pot, rakeBps(env)) : 0;
    const r = rateChallenge({
      decoderRating: row.decoder_rating ?? 1200,
      decoderGames: row.decoder_games ?? 0,
      coderRating: row.coder_rating,
      coderGames: row.coder_games,
      level: row.level,
      solved,
    });
    const dDelta = r.decoderDelta;
    const cDelta = r.coderDelta;
    set.decoder_rating_delta = dDelta;
    set.coder_rating_delta = cDelta;
    extra.push(
      db
        .prepare(
          `UPDATE users SET
             decoder_rating = MAX(100, decoder_rating + ?2),
             decoder_games = decoder_games + ?3,
             solved = solved + ?4,
             failed = failed + ?5,
             streak = CASE WHEN ?4 = 1 THEN streak + 1 ELSE 0 END,
             best_streak = CASE WHEN ?4 = 1 THEN MAX(best_streak, streak + 1) ELSE best_streak END,
             level_sum_solved = level_sum_solved + ?6,
             chips_won = chips_won + ?7
           WHERE id = ?1`,
        )
        .bind(row.decoder_id, dDelta, 1, solved ? 1 : 0, solved ? 0 : 1, solved ? row.level : 0, won),
      db.prepare('UPDATE users SET coder_rating = MAX(100, coder_rating + ?2), coder_games = coder_games + 1 WHERE id = ?1').bind(row.coder_id, cDelta),
    );
  }
  return { transfers, extra, set };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export const challenges = new Hono<AppEnv>();

challenges.post('/validate', async (c) => {
  const body = await readJson<{ message?: string; wagered?: boolean }>(c);
  const r = validateMessage(body.message ?? '', { wagered: !!body.wagered, isWord });
  if (r.ok) return c.json({ ok: true, message: r.message, shape: r.shape });
  return c.json({ ok: false, errors: r.errors.map((e) => ({ ...e, message: describeError(e) })) });
});

challenges.post('/', async (c) => {
  const me = requireUser(c);
  const body = await readJson<{ message?: string; level?: number; pot?: number; key?: number | null; recipient?: string | null }>(c);
  const level = Number(body.level) as Level;
  if (![1, 2, 3, 4, 5, 6].includes(level)) fail('bad_request', 'Choose a level from 1 to 6.');
  const pot = Number(body.pot ?? 0);
  const plan = PLANS[me.plan];
  if (level > plan.maxLevel) fail('plan_limit', `Your ${plan.name} plan creates challenges up to Level ${plan.maxLevel}.`, { maxLevel: plan.maxLevel });
  const potCheck = checkPot(level, pot, plan.potMultiplier);
  if (!potCheck.ok) fail('bad_request', `Pot for Level ${level} must be 0 (friendly) or ${potCheck.min}–${potCheck.max} chips.`, potCheck);

  const v = validateMessage(body.message ?? '', { wagered: pot > 0, isWord });
  if (!v.ok) return fail('invalid_message', v.errors.map(describeError).join(' '), v.errors);

  let key: number;
  if (body.key === null || body.key === undefined) key = randomBytes(1)[0]! % KEY_COUNT;
  else {
    key = Number(body.key);
    if (!Number.isInteger(key) || key < 0 || key >= KEY_COUNT) fail('bad_request', `Key must be 0–${KEY_COUNT - 1}.`);
  }
  const n = letterCount(v.message);
  const voices = levelSpec(level).voices === 'keyed-five' ? voicesFromBytes(randomBytes(voiceEntropyBytes(n)), n) : null;

  const db = c.env.DB;
  let recipientId: string | null = null;
  if (body.recipient) {
    const r = await db.prepare('SELECT id FROM users WHERE username_key = ?1').bind(String(body.recipient).trim().toLowerCase()).first<{ id: string }>();
    if (!r) fail('not_found', `No user called ${body.recipient}.`);
    if (r!.id === me.id) fail('bad_request', 'You can’t send a challenge to yourself.');
    recipientId = r!.id;
  }
  const live = await db.prepare("SELECT COUNT(*) AS n FROM challenges WHERE coder_id = ?1 AND status IN ('open', 'active')").bind(me.id).first<{ n: number }>();
  if ((live?.n ?? 0) >= plan.maxActive) fail('plan_limit', `Your ${plan.name} plan allows ${plan.maxActive} live challenges at once.`, { maxActive: plan.maxActive });
  if (pot > 0 && (await balanceOf(db, me.id)) < pot) fail('insufficient_chips', `You need ${pot} chips to post this pot.`);

  const id = crypto.randomUUID();
  const at = now();
  const spec = levelSpec(level);
  const secret = await sealJson(c.env.GT_SECRET, { m: v.message, k: key, v: voices } satisfies Secret);
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO challenges (id, coder_id, recipient_id, level, status, pot, guess_cost, lives, secret, shape, letter_count, seq, recipient_seen, created_at, last_action_at)
           VALUES (?1, ?2, ?3, ?4, 'open', ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12, ?12)`,
        )
        .bind(id, me.id, recipientId, level, pot, pot > 0 ? spec.guessCost : 0, spec.lives, secret, JSON.stringify(v.shape.words), n, recipientId ? 0 : 1, at),
      db.prepare("INSERT INTO challenge_events (challenge_id, seq, kind, actor_id, created_at) VALUES (?1, 0, 'create', ?2, ?3)").bind(id, me.id, at),
      db.prepare("INSERT INTO accounts (id, kind, balance) VALUES (?1, 'escrow', 0)").bind(accountId(escrow(id))),
      ...transferStatements(db, crypto.randomUUID(), [{ from: userAccount(me.id), to: escrow(id), amount: pot, kind: 'escrow_lock' }], id, at),
    ]);
  } catch (err) {
    if (classifyBatchError(err) === 'insufficient_chips') fail('insufficient_chips', `You need ${pot} chips to post this pot.`);
    throw err;
  }
  const events: LiveEvent[] = recipientId ? [{ userId: recipientId, event: { type: 'inbox', challengeId: id } }] : [{ event: { type: 'lobby', challengeId: id } }];
  broadcast(c, events);
  const row = (await loadChallenge(db, id))!;
  return c.json(await viewOf(c.env, row, me.id), 201);
});

challenges.get('/:id', async (c) => {
  const userId = c.get('user')?.id ?? null;
  const row = await loadChallenge(c.env.DB, c.req.param('id'));
  if (!row) return fail('not_found', 'Challenge not found.');
  const role = roleOf(row, userId);
  if (role === 'viewer' && (row.status !== 'open' || row.recipient_id !== null)) fail('not_found', 'Challenge not found.');
  if (role === 'recipient' && !row.recipient_seen) c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE challenges SET recipient_seen = 1 WHERE id = ?1').bind(row.id).run());
  if (role === 'coder' && !row.coder_seen) c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE challenges SET coder_seen = 1 WHERE id = ?1').bind(row.id).run());
  return c.json(await viewOf(c.env, row, userId));
});

challenges.post('/:id/accept', async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const row = await loadChallenge(db, c.req.param('id'));
  if (!row) return fail('not_found', 'Challenge not found.');
  if (row.status !== 'open') fail('conflict', 'Someone else got there first — this challenge is no longer open.');
  if (row.coder_id === me.id) fail('forbidden', 'You can’t decode your own challenge.');
  if (row.recipient_id && row.recipient_id !== me.id) fail('forbidden', 'This challenge was sent to someone else.');
  const busy = await db.prepare("SELECT COUNT(*) AS n FROM challenges WHERE decoder_id = ?1 AND status = 'active'").bind(me.id).first<{ n: number }>();
  if ((busy?.n ?? 0) >= MAX_ACTIVE_DECODES) fail('plan_limit', `Finish one of your ${MAX_ACTIVE_DECODES} active decodes first.`);
  if (row.guess_cost > 0 && (await balanceOf(db, me.id)) < row.guess_cost) fail('insufficient_chips', `You need at least ${row.guess_cost} chips to make a guess.`);
  const at = now();
  await commit(c.env, row, {
    kind: 'accept',
    actorId: me.id,
    set: { status: 'active', decoder_id: me.id, accepted_at: at, last_action_at: at, coder_seen: 0, recipient_seen: 1 },
    transfers: [],
  });
  broadcast(c, [{ event: { type: 'lobby', challengeId: row.id } }, { userId: row.coder_id, event: { type: 'challenge', challengeId: row.id } }]);
  return c.json(await viewOf(c.env, (await loadChallenge(db, row.id))!, me.id));
});

async function playMove(c: Context<AppEnv>, move: (m: string, row: FullRow) => MoveResult, describe: (r: Extract<MoveResult, { ok: true }>) => unknown, kind: string) {
  const me = requireUser(c);
  const db = c.env.DB;
  const row = await loadChallenge(db, c.req.param('id')!);
  if (!row) return fail('not_found', 'Challenge not found.');
  if (row.decoder_id !== me.id) fail('forbidden', 'Only the decoder can play this challenge.');
  if (row.status !== 'active') fail('invalid_move', 'This challenge is finished.');
  const at = now();
  // Speed bump between paid moves (anti-automation); the first move after accepting is never throttled.
  if (row.actions > 0 && at - row.last_action_at < MIN_ACTION_GAP_MS) fail('too_fast', 'Slow down — one move at a time.');
  const secret = await openJson<Secret>(c.env.GT_SECRET, row.secret);
  const r = move(secret.m, row);
  if (!r.ok) {
    const messages = { not_active: 'This challenge is finished.', invalid_letter: 'Guess a single letter A–Z.', already_guessed: 'You already tried that letter.', empty_attempt: 'Type your answer first.' } as const;
    return fail('invalid_move', messages[r.error], { reason: r.error });
  }
  const fees = feeTransfers(row.level, row.pot > 0, me.id, row.coder_id, rakeBps(c.env));
  const fee = fees.reduce((a, t) => a + t.amount, 0);
  const set: Record<string, string | number | null> = {
    revealed: r.state.revealed,
    missed: r.state.missed,
    wrong: r.state.wrong,
    actions: r.state.actions,
    fees_paid: row.fees_paid + fee,
    last_action_at: at,
    coder_seen: 0,
  };
  let transfers = fees;
  let extra: D1PreparedStatement[] = [];
  if (r.state.status !== 'active') {
    const res = resolutionEffects(c.env, row, r.state.status === 'solved' ? 'solved' : 'failed', at);
    Object.assign(set, res.set);
    transfers = [...fees, ...res.transfers];
    extra = res.extra;
  }
  await commit(c.env, row, { kind, actorId: me.id, data: describe(r), set, transfers, extra });
  const events: LiveEvent[] = [{ userId: row.coder_id, event: { type: 'challenge', challengeId: row.id } }];
  if (r.state.status !== 'active') events.push({ event: { type: 'lobby', challengeId: row.id } }, { event: { type: 'scoreboard' } });
  broadcast(c, events);
  const fresh = (await loadChallenge(db, row.id))!;
  return c.json({ result: { hit: r.hit, occurrences: r.occurrences, fee }, challenge: await viewOf(c.env, fresh, me.id) });
}

challenges.post('/:id/guess', async (c) => {
  const body = await readJson<{ letter?: string }>(c);
  const letter = String(body.letter ?? '').toUpperCase();
  return playMove(
    c,
    (m, row) => applyGuess(m, row.level, { revealed: row.revealed, missed: row.missed, wrong: row.wrong, actions: row.actions, status: 'active' }, letter, row.lives),
    (r) => ({ letter, hit: r.hit, occurrences: r.occurrences }),
    'guess',
  );
});

challenges.post('/:id/solve', async (c) => {
  const body = await readJson<{ attempt?: string }>(c);
  const attempt = String(body.attempt ?? '').slice(0, 200);
  return playMove(
    c,
    (m, row) => applySolve(m, row.level, { revealed: row.revealed, missed: row.missed, wrong: row.wrong, actions: row.actions, status: 'active' }, attempt, row.lives),
    (r) => ({ correct: r.hit }),
    'solve',
  );
});

challenges.post('/:id/forfeit', async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const row = await loadChallenge(db, c.req.param('id'));
  if (!row) return fail('not_found', 'Challenge not found.');
  if (row.decoder_id !== me.id || row.status !== 'active') fail('invalid_move', 'Nothing to give up here.');
  const at = now();
  const res = resolutionEffects(c.env, row, 'forfeited', at);
  await commit(c.env, row, { kind: 'forfeit', actorId: me.id, set: { ...res.set, last_action_at: at }, transfers: res.transfers, extra: res.extra });
  broadcast(c, [{ userId: row.coder_id, event: { type: 'challenge', challengeId: row.id } }, { event: { type: 'lobby', challengeId: row.id } }, { event: { type: 'scoreboard' } }]);
  return c.json(await viewOf(c.env, (await loadChallenge(db, row.id))!, me.id));
});

challenges.post('/:id/withdraw', async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const row = await loadChallenge(db, c.req.param('id'));
  if (!row) return fail('not_found', 'Challenge not found.');
  if (row.coder_id !== me.id) fail('forbidden', 'Only the coder can withdraw.');
  if (row.status !== 'open') fail('conflict', 'A decoder has already accepted — it can’t be withdrawn now.');
  const at = now();
  const res = resolutionEffects(c.env, row, 'withdrawn', at);
  await commit(c.env, row, { kind: 'withdraw', actorId: me.id, set: { ...res.set, coder_seen: 1 }, transfers: res.transfers, extra: res.extra });
  const events: LiveEvent[] = [{ event: { type: 'lobby', challengeId: row.id } }];
  if (row.recipient_id) events.push({ userId: row.recipient_id, event: { type: 'inbox', challengeId: row.id } });
  broadcast(c, events);
  return c.json(await viewOf(c.env, (await loadChallenge(db, row.id))!, me.id));
});

/** Cron: time out abandoned games and stale open challenges. Idempotent and race-safe. */
export async function expireStale(env: Env): Promise<{ expired: number }> {
  const at = now();
  const rows = await env.DB.prepare(
    `${SELECT_FULL} WHERE (ch.status = 'active' AND ch.last_action_at < ?1) OR (ch.status = 'open' AND ch.created_at < ?2) LIMIT 50`,
  )
    .bind(at - ACTIVE_TIMEOUT_MS, at - OPEN_TIMEOUT_MS)
    .all<FullRow>();
  let expired = 0;
  for (const row of rows.results) {
    const res = resolutionEffects(env, row, 'expired', at);
    try {
      await commit(env, row, { kind: 'expire', actorId: null, set: res.set, transfers: res.transfers, extra: res.extra });
      expired++;
    } catch (err) {
      console.warn('expire skipped', row.id, String(err));
    }
  }
  return { expired };
}

export { viewOf, livesLeft };
