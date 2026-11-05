# getting-there — GT: GET THIS

A musical-cipher arena. Every letter of a message becomes a note on a real treble stave, played by the instrument its level assigns. Coders post challenges with a chip prize pot; decoders pay chips per guess, with limited lives, and win the pot if they crack it. The better you read music, the fewer chips you spend.

This repository is the complete build: a tested cipher-and-economy engine, a Cloudflare Worker backend that runs on the **free plan**, and an **Expo SDK 58** app that runs in Expo Go on your phone and is also the web front end.

| | |
|---|---|
| Canonical spec (single source of truth for the team) | [`SPEC.md`](SPEC.md) |
| Every decision, with rationale and what it supersedes | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Economy calibration (simulation evidence) | [`docs/ECONOMY.md`](docs/ECONOMY.md) |
| Put it on Cloudflare (free, preview first) | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| Open it on your phone with Expo Go | [`docs/PHONE.md`](docs/PHONE.md) |
| Rules for AI agents working in this repo | [`AGENTS.md`](AGENTS.md) |

---

## Fastest route to your phone (5 minutes, offline)

Needs Node 22+ and the **Expo Go** app (SDK 58) on your phone, with phone and computer on the same Wi-Fi.

```bash
git clone https://github.com/49-art/getting-there.git
cd getting-there
npm install
npm run phone
```

A QR code appears in the terminal. iPhone: scan it with the Camera. Android: scan it from inside Expo Go. Practice mode and the motif codebook work immediately with no server. For live play (lobby, wagers, inbox, scoreboard) run it once with your Cloudflare preview address — `npm run phone -- https://getting-there-preview.<you>.workers.dev` — see [`docs/PHONE.md`](docs/PHONE.md).

## Put it online (free, preview first)

```bash
npx wrangler login        # once
npm run cf:setup          # creates the preview database and secrets
npm run deploy:preview    # builds the web app and deploys getting-there-preview
```

You get `https://getting-there-preview.<your-subdomain>.workers.dev`. Production is never touched until you choose to. Full walkthrough and the cost guarantees: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Run everything locally

```bash
npm install
npm run web:build                                   # web app → apps/mobile/dist
cd apps/api && cp .dev.vars.example .dev.vars       # then put a long random GT_SECRET in it
npx wrangler d1 migrations apply getting-there --local
npm run dev                                         # http://127.0.0.1:8787 (web + API)
```

## What's in the box

```
packages/engine   Cipher, game rules, economy, ratings, motif codebook. Pure TypeScript, no dependencies.
apps/api          Cloudflare Worker: Hono API, D1 (SQLite) schema, Arena Durable Object for realtime.
apps/mobile       Expo SDK 58 app (Expo Router). Same code runs in Expo Go and as the web app.
scripts/          simulate (economy), generate-samples (instrument audio), build-dictionary,
                  smoke (end-to-end API test), cloudflare-setup.
docs/             Decisions, economy evidence, deploy and phone guides.
```

## How it was verified

| Check | Result |
|---|---|
| Engine unit tests (`npm test`) | 32 passing — cipher maths, 12-key proof, information hiding, lives cap, settlement, ratings, motif uniqueness, sample coverage |
| API end-to-end (`npm run smoke`) | 94 checks passing against a local Worker — registration, recovery-key sign-in, escrow, 10-way concurrent accept (exactly one wins), concurrent guesses, opaque sound tokens, solve/fail/forfeit/withdraw settlement, inbox, ratings, daily grant, CSRF, cookie mode, WebSocket events, ledger sums to zero |
| Scheduled expiry | Stale active and open challenges settle correctly; ledger stays balanced |
| Typecheck | Engine, Worker and app clean |
| Lint | `expo lint` clean (React Compiler rules) |
| Bundles | iOS and Android Hermes bundles and the web export build; all 89 instrument samples bundled |
| Browser run | Full journey in headless Chrome at phone size — register, practice, create, accept, decode, solve, ranks, inbox, profile — no console errors |
| Cloudflare config | `wrangler deploy --dry-run --env preview` passes; Worker is 955 KiB (249 KiB gzipped), inside the free plan's limit |

CI (`.github/workflows/ci.yml`) re-runs all of this on every push without needing any Cloudflare credentials.

## Commands

| Command | Does |
|---|---|
| `npm run phone [-- <server address>]` | Expo dev server + QR code for Expo Go (saves the address the first time) |
| `npm test` | Engine tests |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run simulate` | Re-run the economy calibration (`WRITE=1` updates `docs/ECONOMY.md`) |
| `npm run samples` | Regenerate the instrument WAVs and sample maps |
| `npm run web:build` | Export the web app to `apps/mobile/dist` |
| `npm run api:dev` | Local Worker on port 8787 |
| `npm run smoke [-- <url>]` | End-to-end API test (local by default, or your preview URL) |
| `npm run cf:setup` | One-time Cloudflare preview setup |
| `npm run deploy:preview` | Build and deploy the preview Worker |

---

© HVT Innovations. All rights reserved. Third-party components and their licences: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
