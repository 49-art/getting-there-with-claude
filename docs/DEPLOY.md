# Deploying to Cloudflare — free plan, preview first

Everything in this project runs on the **Cloudflare Workers Free plan**. On that plan, going over a limit makes the extra requests fail with an error; it never creates a bill. Production is never touched until you run the production commands yourself.

## What you need

- Node.js 22 or newer
- A free Cloudflare account. **Stay on the Workers Free plan** — upgrading to Workers Paid is the only way overage charges become possible.
- This repo, with `npm install` run once at the top level

## 1 · Log in (once)

```bash
npx wrangler login
```

A browser window opens; approve access. Nothing is created yet.

## 2 · Set up the preview environment (once)

```bash
npm run cf:setup
```

This does exactly three things and prints each step:

1. Creates a D1 database called `getting-there-preview` (free tier) and writes its id into `apps/api/wrangler.jsonc`.
2. Generates `GT_SECRET` (encrypts challenge answers, signs sound tokens, protects recovery keys) and stores it as a secret on the `getting-there-preview` Worker.
3. Generates `ADMIN_TOKEN` (lets you grant plans), stores it, and **prints it once** — save it in your password manager.

Commit the updated `wrangler.jsonc` (the database id is not a secret).

## 3 · Deploy the preview

```bash
npm run deploy:preview
```

This builds the web app, applies database migrations to the preview database and deploys the `getting-there-preview` Worker. Wrangler prints the address:

```
https://getting-there-preview.<your-subdomain>.workers.dev
```

Open it on any browser — that is the full web app with the API behind it.

## 4 · Check it end to end

```bash
ADMIN_TOKEN=<the token from step 2> npm run smoke -- https://getting-there-preview.<your-subdomain>.workers.dev
```

94 checks run against the live preview (it creates a few throwaway users there). It finishes with the ledger balance check.

## 5 · Point your phone at it

See [`PHONE.md`](PHONE.md): put the preview address in `apps/mobile/.env` and scan the QR code with Expo Go.

## Granting a plan (admin)

```bash
curl -X POST https://getting-there-preview.<your-subdomain>.workers.dev/api/admin/plan \
  -H "authorization: Bearer <ADMIN_TOKEN>" -H "x-gt-client: native" -H "content-type: application/json" \
  -d '{"username":"travis","plan":"host","days":30}'
```

Plans: `free`, `coder`, `host`, `studio`. Omit `days` for no expiry.

## Updating the preview

Run `npm run deploy:preview` again. New database migrations (if any) are applied first.

## Production — only when you decide

```bash
npm run cf:setup -- --production
npm run deploy:production
```

This creates a separate `getting-there` database and Worker. Preview and production never share data.

## Free-plan limits this build runs inside

| Resource | Free allowance | What happens at the limit |
|---|---|---|
| Worker requests (API only) | 100,000 per day | Further API requests error until 00:00 UTC |
| Static assets (the web app, sounds) | Free, not counted as Worker requests | — |
| D1 | 5 million rows read and 100,000 rows written per day; 5 GB storage | Queries error until reset |
| Durable Objects (realtime) | 100,000 requests per day; outgoing WebSocket messages are free; idle sockets hibernate | Realtime pauses; the app keeps working by refetching |
| Cron trigger | Included | — |
| Worker size | 3 MB compressed; this Worker is 249 KiB | — |

Observability (Workers Logs) is switched off in `wrangler.jsonc`. Nothing in this project uses KV, R2, Queues, Workers AI, Logpush or any other product that could carry a cost.

**GitHub Actions:** CI runs on every push using GitHub's included minutes for private repositories. If you ever run out and have no payment method on GitHub, jobs simply stop — nothing is billed. CI never deploys and never needs Cloudflare credentials.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `GT_SECRET must be set` in responses | Run `npm run cf:setup` (or `npx wrangler secret put GT_SECRET --env preview`) |
| `Couldn't find a D1 DB with the name or binding` | The database id in `wrangler.jsonc` is still all zeros — rerun `npm run cf:setup` |
| Web app shows a blank page after deploy | Run `npm run web:build` first; `deploy:preview` does this for you |
| `Not logged in` | `npx wrangler login` |
