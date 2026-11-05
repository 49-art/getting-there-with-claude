/**
 * One-time Cloudflare setup for the PREVIEW environment (free plan).
 *
 *   npx wrangler login          # once, opens your browser
 *   npm run cf:setup            # creates the preview database + secrets
 *   npm run deploy:preview      # builds the web app and deploys the preview Worker
 *
 * What it does, and nothing else:
 *  1. Creates a D1 database "getting-there-preview" (free tier) if it doesn't exist
 *     and writes its id into apps/api/wrangler.jsonc.
 *  2. Generates GT_SECRET (encrypts challenge answers, signs sound tokens,
 *     protects recovery keys) and ADMIN_TOKEN (grants plans) and stores them as
 *     Worker secrets on the preview Worker. The admin token is printed once.
 *  3. Never touches production. Run with --production to set up production instead.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const production = process.argv.includes('--production');
const env = production ? null : 'preview';
const dbName = production ? 'getting-there' : 'getting-there-preview';
const workerName = production ? 'getting-there' : 'getting-there-preview';
const apiDir = new URL('../apps/api/', import.meta.url);
const configPath = new URL('wrangler.jsonc', apiDir);

function wrangler(args: string[], input?: string) {
  const r = spawnSync('npx', ['wrangler', ...args], { cwd: apiDir, input, encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, CI: '1' } });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

console.log(`\nGT Cloudflare setup → ${production ? 'PRODUCTION' : 'preview'} (${workerName})\n`);

const who = wrangler(['whoami']);
if (!who.ok || /not authenticated/i.test(who.out)) {
  console.error('You are not logged in to Cloudflare. Run:  npx wrangler login   then run this again.');
  process.exit(1);
}

// 1. Database
let id: string | undefined;
const list = wrangler(['d1', 'list', '--json']);
try {
  id = (JSON.parse(list.out.slice(list.out.indexOf('['))) as Array<{ name: string; uuid: string }>).find((d) => d.name === dbName)?.uuid;
} catch {
  /* fall through to create */
}
if (!id) {
  const created = wrangler(['d1', 'create', dbName, '--update-config=false']);
  const m = /"?database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/i.exec(created.out) ?? /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(created.out);
  if (!created.ok || !m) {
    console.error('Could not create the database:\n', created.out);
    process.exit(1);
  }
  id = m[1];
  console.log(`✓ Created D1 database ${dbName} (${id})`);
} else console.log(`✓ Found D1 database ${dbName} (${id})`);

let config = readFileSync(configPath, 'utf8');
const pattern = new RegExp(`("database_name":\\s*"${dbName}",\\s*"database_id":\\s*")[^"]*(")`);
if (!pattern.test(config)) {
  console.error('Could not find the database entry in wrangler.jsonc — edit it by hand: database_id =', id);
  process.exit(1);
}
config = config.replace(pattern, `$1${id}$2`);
writeFileSync(configPath, config);
console.log('✓ Wrote the database id into apps/api/wrangler.jsonc');

// 2. Secrets
const secret = randomBytes(32).toString('base64url');
const admin = randomBytes(24).toString('base64url');
for (const [name, value] of [['GT_SECRET', secret], ['ADMIN_TOKEN', admin]] as const) {
  const args = ['secret', 'put', name];
  if (env) args.push('--env', env);
  const r = wrangler(args, value);
  if (!r.ok) {
    console.error(`Could not set ${name}:\n`, r.out);
    process.exit(1);
  }
  console.log(`✓ Stored secret ${name} on ${workerName}`);
}

console.log(`
Done. Keep this admin token somewhere safe (it is not stored anywhere else):

  ADMIN_TOKEN=${admin}

Next:  npm run deploy:${production ? 'production' : 'preview'}
`);
