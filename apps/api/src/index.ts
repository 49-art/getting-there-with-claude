import { Hono } from 'hono';
import { auth, csrfGuard, sessionMiddleware } from './auth.ts';
import { challenges, expireStale } from './challenges.ts';
import type { AppEnv, Env } from './env.ts';
import { errorResponse } from './http.ts';
import { arenaStub, broadcastEnv } from './live.ts';
import { routes } from './routes.ts';
import { preparedEnv } from './setup.ts';

export { Arena } from './arena.ts';

const app = new Hono<AppEnv>();

app.use('/api/*', async (c, next) => {
  await next();
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'no-referrer');
  if (!c.res.headers.get('cache-control')) c.header('cache-control', 'no-store');
});
app.use('/api/*', csrfGuard);
app.use('/api/*', sessionMiddleware);

/** Realtime: upgrade to a WebSocket held by the Arena Durable Object. */
app.get('/api/live', async (c) => {
  if (c.req.header('upgrade') !== 'websocket') return c.json({ error: { code: 'bad_request', message: 'Expected a WebSocket upgrade.' } }, 426);
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-gt-user', c.get('user')?.id ?? '');
  return arenaStub(c.env).fetch(new Request('https://arena/connect', { headers }));
});

app.route('/api/auth', auth);
app.route('/api/challenges', challenges);
app.route('/api', routes);

app.all('/api/*', (c) => c.json({ error: { code: 'not_found', message: 'No such endpoint.' } }, 404));
app.onError((err, c) => errorResponse(c, err));

export default {
  async fetch(request, env, ctx) {
    // Static files never reach here (see run_worker_first); every API call gets a ready database.
    let ready: Env;
    try {
      ready = await preparedEnv(env);
    } catch (err) {
      console.error('setup failed', err);
      return Response.json({ error: { code: 'server_error', message: 'The server is starting up. Please try again in a moment.' } }, { status: 503 });
    }
    return app.fetch(request, ready, ctx);
  },
  async scheduled(_event, env, ctx) {
    const ready = await preparedEnv(env);
    const { expired } = await expireStale(ready);
    if (expired > 0) broadcastEnv(ready, ctx, [{ event: { type: 'lobby' } }, { event: { type: 'scoreboard' } }]);
  },
} satisfies ExportedHandler<Env>;
