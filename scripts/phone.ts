/**
 * Start the app for Expo Go and show the QR code.
 *
 *   npm run phone                          offline (Practice + motifs), or the saved server
 *   npm run phone -- https://your-address  save the server address, then start
 *   npm run phone -- --tunnel              any extra options go straight to Expo
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//i.test(a));
const rest = args.filter((a) => a !== url);
const mobileDir = fileURLToPath(new URL('../apps/mobile/', import.meta.url));
const envFile = fileURLToPath(new URL('../apps/mobile/.env', import.meta.url));

if (url) {
  const clean = url.trim().replace(/\/+$/, '');
  writeFileSync(envFile, `EXPO_PUBLIC_API_URL=${clean}\n`);
  console.log(`\n✓ Saved your server address: ${clean}\n  (next time, just run: npm run phone)\n`);
} else if (existsSync(envFile) && /EXPO_PUBLIC_API_URL=\S+/.test(readFileSync(envFile, 'utf8'))) {
  console.log(`\nUsing ${readFileSync(envFile, 'utf8').trim()}\n`);
} else {
  console.log('\nNo server address saved, so the app opens in offline Practice mode.\nTo go live:  npm run phone -- https://getting-there-with-claude.hvtinnovations1.workers.dev\n');
}

const expoArgs = ['expo', 'start', ...(url ? ['--clear'] : []), ...rest];
const child = spawn('npx', expoArgs, { cwd: mobileDir, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
