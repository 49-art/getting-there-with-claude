/**
 * Optional hardening for a Cloudflare deployment: stores your own GT_SECRET
 * and an ADMIN_TOKEN as Worker secrets.
 *
 *   npm run cf:setup                   preview Worker ("getting-there") — optional
 *   npm run cf:setup -- --production   production Worker ("getting-there-live") — required
 *                                      before the first production deploy
 *
 * Preview works without this: on first start it generates its own secret and
 * keeps it in its database. Production refuses to run without GT_SECRET.
 * Needs `npx wrangler login` once. Never touches the other environment.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const production = process.argv.includes('--production');
const root = fileURLToPath(new URL('../', import.meta.url));
const worker = production ? 'getting-there-live' : 'getting-there';

function wrangler(args: string[], input?: string) {
  const r = spawnSync('npx', ['wrangler', ...args, '-c', 'wrangler.jsonc', ...(production ? ['--env', 'production'] : [])], {
    cwd: root,
    input,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, CI: '1' },
  });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

console.log(`\nGT Cloudflare secrets → ${worker}\n`);
const who = spawnSync('npx', ['wrangler', 'whoami'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
if (who.status !== 0 || /not authenticated/i.test(`${who.stdout}${who.stderr}`)) {
  console.error('You are not logged in to Cloudflare. Run:  npx wrangler login   then run this again.');
  process.exit(1);
}

const secret = randomBytes(32).toString('base64url');
const admin = randomBytes(24).toString('base64url');
for (const [name, value] of [['GT_SECRET', secret], ['ADMIN_TOKEN', admin]] as const) {
  const r = wrangler(['secret', 'put', name], value);
  if (!r.ok) {
    console.error(`Could not set ${name}:\n`, r.out);
    process.exit(1);
  }
  console.log(`✓ Stored secret ${name} on ${worker}`);
}
console.log(`
Done. Keep this admin token somewhere safe (it is not stored anywhere else):

  ADMIN_TOKEN=${admin}
${production ? '' : '\nNote: preview accounts made before this step stop working, because their keys came from the old auto-generated secret.\n'}`);
