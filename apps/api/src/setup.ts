import init0001 from '../migrations/0001_init.sql';
import init0002 from '../migrations/0002_app_config.sql';
import { b64url, randomBytes } from './crypto.ts';
import type { Env } from './env.ts';

/**
 * Self-setup on first request, so push-to-deploy needs no manual steps:
 *  1. Applies any migration not yet recorded in d1_migrations (the same table
 *     `wrangler d1 migrations apply` uses, so both routes stay compatible).
 *  2. Preview only: if GT_SECRET isn't set, generates one and keeps it in D1.
 *     Production refuses to run without a real GT_SECRET secret.
 * Runs once per Worker instance; failures are retried on the next request.
 */
export const MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = [
  { name: '0001_init.sql', sql: init0001 },
  { name: '0002_app_config.sql', sql: init0002 },
];

/** Split a migration into statements. Statements end at a line ending in ';' (triggers are one line). */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  for (const raw of sql.split('\n')) {
    const line = raw.replace(/--.*$/, '').trimEnd();
    if (!line.trim()) continue;
    buf.push(line);
    if (line.endsWith(';')) {
      out.push(buf.join('\n').replace(/;$/, ''));
      buf = [];
    }
  }
  if (buf.join('').trim()) out.push(buf.join('\n'));
  return out;
}

async function migrate(db: D1Database): Promise<void> {
  await db.prepare('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)').run();
  const done = new Set((await db.prepare('SELECT name FROM d1_migrations').all<{ name: string }>()).results.map((r) => r.name));
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    try {
      await db.batch([...splitStatements(m.sql).map((s) => db.prepare(s)), db.prepare('INSERT INTO d1_migrations (name) VALUES (?1)').bind(m.name)]);
    } catch (err) {
      // Another instance may have applied it at the same moment.
      const row = await db.prepare('SELECT 1 FROM d1_migrations WHERE name = ?1').bind(m.name).first();
      if (!row) throw err;
    }
  }
}

async function previewSecret(db: D1Database): Promise<string> {
  await db.prepare("INSERT OR IGNORE INTO app_config (key, value) VALUES ('gt_secret', ?1)").bind(b64url(randomBytes(32))).run();
  const row = await db.prepare("SELECT value FROM app_config WHERE key = 'gt_secret'").first<{ value: string }>();
  if (!row) throw new Error('could not read the preview secret');
  return row.value;
}

export type SecretSource = 'configured' | 'auto-preview' | 'missing';

let ready: Promise<{ secret: string; source: SecretSource }> | null = null;

export function prepare(env: Env): Promise<{ secret: string; source: SecretSource }> {
  if (!ready) {
    ready = (async () => {
      await migrate(env.DB);
      if (env.GT_SECRET && env.GT_SECRET.length >= 32) return { secret: env.GT_SECRET, source: 'configured' as const };
      if (env.GT_ENV === 'production') return { secret: '', source: 'missing' as const };
      return { secret: await previewSecret(env.DB), source: 'auto-preview' as const };
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** The environment as every handler should see it: schema in place and GT_SECRET resolved. */
export async function preparedEnv(env: Env): Promise<Env & { SECRET_SOURCE: SecretSource }> {
  const { secret, source } = await prepare(env);
  return { ...env, GT_SECRET: secret, SECRET_SOURCE: source };
}
