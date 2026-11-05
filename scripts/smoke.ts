/**
 * End-to-end smoke test for a running GT API (local or deployed preview).
 *
 *   npm run smoke                          # http://127.0.0.1:8787
 *   npm run smoke -- https://getting-there-preview.<you>.workers.dev
 *   ADMIN_TOKEN=... npm run smoke -- <url> # also exercises the admin plan path
 *
 * Covers: registration & recovery-key sign-in, validation, escrow, lobby,
 * race-safe accept, information hiding, sound tokens, solve/fail/forfeit/
 * withdraw settlement, direct challenges & inbox, ratings, daily grant,
 * CSRF guard, web cookie mode, realtime WebSocket, and the ledger invariant.
 * Creates throwaway users; safe to run repeatedly.
 */
const BASE = (process.argv[2] ?? process.env.BASE ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const ADMIN = process.env.ADMIN_TOKEN ?? '';
const run = Math.random().toString(36).slice(2, 7);
let passed = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function check(cond: unknown, label: string, extra?: unknown): asserts cond {
  if (!cond) {
    console.error(`✗ ${label}`, extra === undefined ? '' : JSON.stringify(extra, null, 2));
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${label}`);
}

interface Res<T = any> { status: number; body: T; headers: Headers }
async function api<T = any>(path: string, opts: { method?: string; token?: string; body?: unknown; client?: string | null; headers?: Record<string, string> } = {}): Promise<Res<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.client !== null) headers['x-gt-client'] = opts.client ?? 'native';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${BASE}/api${path}`, { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* binary or text */ }
  return { status: r.status, body, headers: r.headers };
}

async function register(name: string) {
  const r = await api('/auth/register', { body: { username: name, device: 'smoke' } });
  check(r.status === 201, `register ${name}`, r.body);
  return { name, token: r.body.token as string, recovery: r.body.recoveryKey as string, id: r.body.user.id as string };
}
const me = async (token: string) => (await api('/me', { token })).body;

async function solveByGuessing(id: string, token: string, message: string) {
  const letters = [...new Set(message.replace(/[^A-Z]/g, ''))];
  let last: any;
  for (const l of letters) {
    await sleep(650);
    const r = await api(`/challenges/${id}/guess`, { token, body: { letter: l } });
    check(r.status === 200, `guess ${l}`, r.body);
    last = r.body;
    if (last.challenge.status !== 'active') break;
  }
  return last.challenge;
}

console.log(`GT smoke test → ${BASE}\n`);

// ---- health & config
const health = await api('/health');
check(health.status === 200 && health.body.ok, 'health endpoint');
const config = await api('/config');
check(config.body.levels?.length === 6, 'config lists 6 levels');

// ---- accounts
const alice = await register(`alice_${run}`);
const bob = await register(`bob_${run}`);
const carol = await register(`carol_${run}`);
const dave = await register(`dave_${run}`);
check(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}-[0-9A-Z]$/.test(alice.recovery), 'recovery key format XXXXX-…', alice.recovery);
check((await me(alice.token)).balance === 100, 'starter grant of 100 chips');
check((await api('/auth/register', { body: { username: `ALICE_${run}` } })).status === 409, 'usernames are unique case-insensitively');
check((await api('/auth/register', { body: { username: 'admin' } })).status === 409, 'reserved usernames rejected');
check((await api('/auth/register', { body: { username: '1x' } })).status === 400, 'invalid usernames rejected');
const avail = await api(`/auth/available?username=alice_${run}`);
check(avail.body.available === false, 'availability check');
const signin = await api('/auth/signin', { body: { username: bob.name.toUpperCase(), recoveryKey: bob.recovery.toLowerCase().replace(/-/g, '') } });
check(signin.status === 200 && signin.body.token, 'sign in on a second device with recovery key (case/dash tolerant)');
check((await me(signin.body.token)).username === bob.name, 'second-device session works');
check((await api('/auth/signin', { body: { username: bob.name, recoveryKey: 'WRONG-KEYXX-XXXXX-XXXXX-XXXXX-X' } })).status === 401, 'wrong recovery key rejected');

// ---- CSRF & web cookie mode
check((await api('/bank/daily', { token: alice.token, body: {}, client: null })).status === 403, 'mutations without client header blocked (CSRF guard)');
const web = await api('/auth/register', { body: { username: `web_${run}` }, client: 'web' });
const cookie = web.headers.get('set-cookie') ?? '';
check(web.status === 201 && !web.body.token && /HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie), 'web clients get an HttpOnly SameSite cookie, no token in body');

// ---- validation
const gib = await api('/challenges/validate', { token: alice.token, body: { message: 'QXZJ VKWP', wagered: true } });
check(gib.body.ok === false && gib.body.errors.some((e: any) => e.code === 'not_words'), 'wagered messages must be real words');
const emoji = await api('/challenges/validate', { token: alice.token, body: { message: 'HI 🎵', wagered: false } });
check(emoji.body.ok === false && emoji.body.errors[0].code === 'unsupported_chars', 'unsupported characters are named, not dropped');
const okv = await api('/challenges/validate', { token: alice.token, body: { message: "don't stop building", wagered: true } });
check(okv.body.ok === true, 'contractions accepted', okv.body);

// ---- realtime
const wsUrl = `${BASE.replace(/^http/, 'ws')}/api/live`;
const ws = new WebSocket(wsUrl);
const wsEvents: any[] = [];
await new Promise<void>((resolve, reject) => {
  ws.onmessage = (e) => wsEvents.push(JSON.parse(String(e.data)));
  ws.onopen = () => resolve();
  ws.onerror = (e) => reject(e);
  setTimeout(() => reject(new Error('ws timeout')), 5000);
});
await sleep(300);
check(wsEvents.some((e) => e.type === 'hello'), 'realtime socket connects');

// ---- create an open wagered challenge
const MSG1 = 'KEEP BUILDING';
const c1 = await api('/challenges', { token: alice.token, body: { message: MSG1.toLowerCase(), level: 1, pot: 5 } });
check(c1.status === 201 && c1.body.status === 'open' && c1.body.message === MSG1, 'coder creates a wagered challenge and sees the message', c1.body);
const id1 = c1.body.id as string;
const aliceAfter = await me(alice.token);
check(aliceAfter.balance === 95 && aliceAfter.escrowed === 5, 'pot escrowed from coder');
await sleep(500);
check(wsEvents.some((e) => e.type === 'lobby'), 'lobby event pushed over the socket');
const lobby = await api('/lobby');
check(lobby.body.open.some((x: any) => x.id === id1), 'challenge listed in the lobby');
check(!JSON.stringify(lobby.body).includes('KEEP'), 'lobby never contains the message');

const peek = await api(`/challenges/${id1}`, { token: carol.token });
check(peek.status === 200 && peek.body.tokens === null && peek.body.message === null, 'prospective decoder sees the card, not the notes');

// ---- race-safe accept: 10 concurrent attempts, exactly one wins
const attempts = await Promise.all(Array.from({ length: 10 }, (_, i) => api(`/challenges/${id1}/accept`, { token: i % 2 ? bob.token : carol.token, body: {} })));
const wins = attempts.filter((a) => a.status === 200);
check(wins.length === 1, 'exactly one of 10 concurrent accepts succeeds', attempts.map((a) => a.status));
check(attempts.filter((a) => a.status !== 200).every((a) => a.status === 409), 'losing accepts get 409 conflict');
const decoder = wins[0]!.body.decoder.username === bob.name ? bob : carol;
const other = decoder === bob ? carol : bob;

// ---- information hiding for the decoder
const v1 = await api(`/challenges/${id1}`, { token: decoder.token });
check(Array.isArray(v1.body.tokens) && v1.body.tokens.length === MSG1.length, 'decoder receives the score');
check(v1.body.message === null && v1.body.key === null, 'decoder does not receive message or key');
check(!JSON.stringify(v1.body).match(/"ch":"[A-Z]"/), 'no unrevealed letters in the payload');
const sound = v1.body.tokens.find((t: any) => t.k === 'letter').s as string;
check(/^\/api\/sound\/[A-Za-z0-9_-]{30,}$/.test(sound) && !/piano|guitar|violin|bass|synth|_\d\d/.test(sound), 'sound reference is opaque');
const s1 = await fetch(`${BASE}${sound}`);
const s2 = await fetch(`${BASE}${sound}`);
const b1 = new Uint8Array(await s1.arrayBuffer());
const b2 = new Uint8Array(await s2.arrayBuffer());
check(s1.headers.get('content-type') === 'audio/wav' && b1.length > 20000, 'sound token serves a WAV');
check(b1.length !== b2.length || b1.some((x, i) => x !== b2[i]), 'sound bytes vary per request (no fingerprinting)');
check((await api('/challenges/' + id1 + '/guess', { token: other.token, body: { letter: 'E' } })).status === 403, 'only the decoder can guess');

// ---- concurrent guesses: one wins
await sleep(650);
const g = await Promise.all(Array.from({ length: 4 }, () => api(`/challenges/${id1}/guess`, { token: decoder.token, body: { letter: 'E' } })));
check(g.filter((x) => x.status === 200).length === 1, 'exactly one of 4 concurrent identical guesses lands', g.map((x) => x.status));
const decBefore = (await me(decoder.token)).balance;

// ---- solve it
const solved = await solveByGuessing(id1, decoder.token, MSG1.replace(/E/g, ''));
check(solved.status === 'solved', 'challenge solved by guessing');
check(solved.message === MSG1, 'message revealed after resolution');
check(typeof solved.ratingDelta === 'number' && solved.ratingDelta > 0, 'decoder rating rises after a lobby win', solved.ratingDelta);
const decAfter = await me(decoder.token);
const aliceEnd = await me(alice.token);
const fees = solved.feesPaid as number;
check(decAfter.balance === decBefore - (fees - 1) + 5, 'decoder paid fees and won the pot', { decBefore, after: decAfter.balance, fees });
check(aliceEnd.balance === 95 + fees, 'coder kept every guess fee', { balance: aliceEnd.balance, fees });
check(decAfter.stats.solved === 1, 'scoreboard stats updated');
check((await api(`/challenges/${id1}/guess`, { token: decoder.token, body: { letter: 'Z' } })).status === 422, 'no moves after resolution');

// ---- failing path: lives cap misses, pot returns to coder
const MSG2 = 'MUSIC IS CODE';
const c2 = await api('/challenges', { token: alice.token, body: { message: MSG2, level: 3, pot: 10 } });
check(c2.status === 201, 'level 3 challenge created');
const acc2 = await api(`/challenges/${c2.body.id}/accept`, { token: other.token, body: {} });
check(acc2.status === 200, 'second decoder accepts');
let state: any = acc2.body;
for (const l of 'ZQXJKVWYBFG') {
  if (state.status !== 'active') break;
  await sleep(650);
  const r = await api(`/challenges/${c2.body.id}/guess`, { token: other.token, body: { letter: l } });
  check(r.status === 200, `miss ${l}`, r.body);
  state = r.body.challenge;
}
check(state.status === 'failed' && state.wrong === 6, 'challenge fails when lives run out (6 at Level 3)', state);
check(state.message === MSG2, 'answer revealed to the decoder after failing');
const aliceAfterFail = await me(alice.token);
check(aliceAfterFail.balance === aliceEnd.balance + 6 * 2, 'pot refunded to coder plus 6 guess fees of 2 chips', aliceAfterFail.balance);

// ---- wrong solve attempt costs 2 lives; forfeit settles to coder
const c3 = await api('/challenges', { token: alice.token, body: { message: 'GET THIS DONE', level: 2, pot: 4 } });
await api(`/challenges/${c3.body.id}/accept`, { token: decoder.token, body: {} });
await sleep(650);
const wrongSolve = await api(`/challenges/${c3.body.id}/solve`, { token: decoder.token, body: { attempt: 'got this done' } });
check(wrongSolve.status === 200 && wrongSolve.body.challenge.wrong === 2 && wrongSolve.body.result.hit === false, 'wrong solve attempt costs 2 lives');
const forfeit = await api(`/challenges/${c3.body.id}/forfeit`, { token: decoder.token, body: {} });
check(forfeit.status === 200 && forfeit.body.status === 'forfeited', 'decoder can forfeit');

// ---- right solve attempt wins immediately
const c4 = await api('/challenges', { token: alice.token, body: { message: 'GOOD MUSIC', level: 1, pot: 3 } });
await api(`/challenges/${c4.body.id}/accept`, { token: decoder.token, body: {} });
await sleep(650);
const rightSolve = await api(`/challenges/${c4.body.id}/solve`, { token: decoder.token, body: { attempt: 'good music' } });
check(rightSolve.status === 200 && rightSolve.body.challenge.status === 'solved', 'solving the whole phrase wins at once');

// ---- withdraw vs accept, plan limits
const c5 = await api('/challenges', { token: dave.token, body: { message: 'SPARE KEYS', level: 2, pot: 5 } });
check((await me(dave.token)).balance === 95, 'pot escrowed');
const wd = await api(`/challenges/${c5.body.id}/withdraw`, { token: dave.token, body: {} });
check(wd.status === 200 && wd.body.status === 'withdrawn' && (await me(dave.token)).balance === 100, 'coder can withdraw an open challenge for a full refund');
check((await api(`/challenges/${c5.body.id}/accept`, { token: bob.token, body: {} })).status === 409, 'withdrawn challenge cannot be accepted');
check((await api('/challenges', { token: dave.token, body: { message: 'MASTER CLASS', level: 6, pot: 20 } })).status === 403, 'free plan cannot create Master challenges');
check((await api('/challenges', { token: dave.token, body: { message: 'TOO MUCH', level: 1, pot: 50 } })).status === 400, 'pot outside level range rejected');

// ---- direct friendly message → inbox
const dm = await api('/challenges', { token: alice.token, body: { message: 'See you at 8!', level: 1, pot: 0, recipient: carol.name } });
check(dm.status === 201 && dm.body.direct && dm.body.pot === 0, 'friendly direct transmission sent');
const inbox = await api('/inbox?box=received', { token: carol.token });
check(inbox.body.items.some((x: any) => x.id === dm.body.id && x.unseen), 'arrives unseen in recipient inbox');
check((await me(carol.token)).unseen >= 1, 'unseen badge count');
await api(`/challenges/${dm.body.id}`, { token: carol.token });
await sleep(300);
check(!(await api('/inbox?box=received', { token: carol.token })).body.items.find((x: any) => x.id === dm.body.id).unseen, 'opening marks it seen');
check((await api(`/challenges/${dm.body.id}/accept`, { token: bob.token, body: {} })).status === 403, 'only the recipient can accept a direct transmission');
const sent = await api('/inbox?box=sent', { token: alice.token });
check(sent.body.items.length >= 5, 'sent box lists coder transmissions');
check(!(await api('/lobby')).body.open.some((x: any) => x.id === dm.body.id), 'direct transmissions stay out of the lobby');

// ---- daily grant
const d1 = await api('/bank/daily', { token: dave.token, body: {} });
check(d1.status === 200 && d1.body.balance === 115, 'daily grant claimed', d1.body);
check((await api('/bank/daily', { token: dave.token, body: {} })).status === 409, 'daily grant only once per day');
const bank = await api('/bank', { token: dave.token });
check(bank.body.entries.some((e: any) => e.kind === 'daily_grant') && bank.body.entries.some((e: any) => e.kind === 'refund'), 'bank statement lists ledger entries');

// ---- admin plan upgrade + overdraft protection
if (ADMIN) {
  const up = await api('/admin/plan', { body: { username: dave.name, plan: 'studio', days: 30 }, headers: { authorization: `Bearer ${ADMIN}` } });
  check(up.status === 200, 'admin grants a plan');
  check((await me(dave.token)).plan === 'studio', 'plan takes effect');
  const big = await api('/challenges', { token: dave.token, body: { message: 'MASTER CLASS', level: 6, pot: 300 } });
  check(big.status === 402, 'cannot escrow more chips than you hold', big.body);
} else console.log('· (set ADMIN_TOKEN to test admin plan grants)');
check((await api('/admin/plan', { body: { username: dave.name, plan: 'studio' }, headers: { authorization: 'Bearer nope' } })).status === 403, 'admin endpoint rejects bad tokens');

// ---- scoreboards
for (const view of ['decoders', 'coders', 'week', 'level1']) {
  const r = await api(`/scoreboard?view=${view}`);
  check(r.status === 200 && Array.isArray(r.body.rows), `scoreboard view ${view}`);
}
const board = await api('/scoreboard?view=decoders');
check(board.body.rows.some((r: any) => r.username === decoder.name), 'winner appears on the live scoreboard');
check(wsEvents.some((e) => e.type === 'scoreboard'), 'scoreboard changes pushed live');

// ---- sign out
await api('/auth/signout', { token: bob.token, body: {} });
check((await api('/me', { token: bob.token })).status === 401, 'signed-out token no longer works');

// ---- the ledger always balances
const end = await api('/health');
check(end.body.ledgerBalanced === true, 'ledger balances: SUM(all accounts) = 0');

ws.close();
console.log(`\nAll ${passed} checks passed.`);
