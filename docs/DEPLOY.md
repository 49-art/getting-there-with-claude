# Going live on Cloudflare — free plan, push to deploy

This works the same way as your other apps: the code lives on GitHub, Cloudflare watches the repo, and every time new code is pushed it rebuilds and publishes the app by itself. You set it up once, in the browser. No installs, no typing commands.

Everything runs on the **Cloudflare Workers Free plan**. On that plan, going over a limit makes the extra requests fail with an error; it never creates a bill, and a free account has no card on it.

## One-time setup (about 10 minutes, all clicks)

1. **Open Cloudflare's "create" page:** <https://dash.cloudflare.com/?to=/:account/workers-and-pages/create> (sign up free if asked).
2. Choose **Import a repository** (Git / GitHub), and connect GitHub if asked. Pick the **getting-there-with-claude** repository.
3. Fill in the settings:

   | Setting | Value |
   |---|---|
   | Project name | `getting-there-with-claude` (must match `name` in `wrangler.jsonc`) |
   | Build command | `npm ci && npm run build` |
   | Deploy command | `npx wrangler deploy` (usually filled in already) |
   | Root directory | leave empty |

4. Press **Save and Deploy**. The first build takes about 3–5 minutes.
5. Your app is at `https://getting-there-with-claude.<your-subdomain>.workers.dev` — open it on your computer or your phone. Travis's live preview: <https://getting-there-with-claude.hvtinnovations1.workers.dev>

That's it. The app creates its own database tables and its own encryption key on first start, so there is nothing else to configure for the preview.

## After that

- Every push to `main` (from Claude, from Grok, or from anyone you allow) rebuilds and goes live in a few minutes.
- Build history and logs: Cloudflare dashboard → **Workers & Pages** → **getting-there** → **Deployments**.
- On a phone, open the address in the browser and use *Add to Home Screen* for an app icon. For the native Expo Go version, see [`PHONE.md`](PHONE.md).

## If the first build stops with a permission message about D1

Cloudflare's automatic build key can't always create databases. Fix it once: open the project's **Settings → Builds → API token**, create a new token from the *Edit Cloudflare Workers* template, add **Account → D1 → Edit**, save, and press **Retry build**. (If the Cloudflare connector is connected in Claude, Claude can create the database for you instead.)

## Production — only when you decide

Production is a separate Worker (`getting-there-live`) with its own database, so preview and production never share data. It needs one real secret before it will run:

```bash
npx wrangler login
npm run cf:setup -- --production   # stores GT_SECRET and ADMIN_TOKEN, prints the admin token once
npm run deploy:production
```

## Doing it from a terminal instead (optional)

If you prefer commands to clicks, from the repo folder (needs Node.js 22+):

```bash
npm install
npx wrangler login
npm run deploy:preview
```

`npm run cf:setup` (preview) is optional: it replaces the auto-generated key with your own and gives you an admin token for granting plans. Run it before people sign up — accounts made under the old key stop working.

## Granting a plan (admin)

Needs the admin token from `npm run cf:setup`:

```bash
curl -X POST https://getting-there-with-claude.hvtinnovations1.workers.dev/api/admin/plan \
  -H "authorization: Bearer <ADMIN_TOKEN>" -H "x-gt-client: native" -H "content-type: application/json" \
  -d '{"username":"travis","plan":"host","days":30}'
```

## Checking a live deployment

`https://getting-there-with-claude.hvtinnovations1.workers.dev/api/health` shows `ok`, which secret is in use, and whether the chip ledger balances. The full 94-check test can run against it from a terminal: `npm run smoke -- <your address>` (it creates a few test users there).

## Free-plan limits this build runs inside

| Resource | Free allowance | What happens at the limit |
|---|---|---|
| Worker requests (API only) | 100,000 per day | Further API requests error until 00:00 UTC |
| Static assets (the web app, sounds) | Free, not counted as Worker requests | — |
| D1 database | 5 million rows read and 100,000 rows written per day; 5 GB | Queries error until reset |
| Durable Objects (live updates) | 100,000 requests per day; outgoing messages free; idle connections hibernate | Live updates pause; the app keeps working by refreshing |
| Builds | 3,000 build minutes per month (about 4 minutes per build) | — |
| Worker size | 3 MB compressed; this Worker is 252 KiB | — |

Logging (Workers Logs) is switched off. Nothing in this project uses KV, R2, Queues, Workers AI, Logpush or any other product that could carry a cost.

**GitHub checks:** every push also runs the project's automatic tests on GitHub (about 10 minutes each). Free private repos include 2,000 minutes a month; with no card on your GitHub account, the checks simply pause if that runs out. Nothing is billed, and going live on Cloudflare doesn't depend on them.
