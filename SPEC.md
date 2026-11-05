# GT: GET THIS — Canonical Specification

**Status:** v2.0, implemented in this repository. This file is the single source of truth for product rules. If a brief, ADR, chat transcript or agent disagrees with it, this file wins until Travis signs a change into [`docs/DECISIONS.md`](docs/DECISIONS.md).

Every rule below is enforced in code. The authoritative constants live in [`packages/engine/src/constants.ts`](packages/engine/src/constants.ts); the server enforces them in [`apps/api/src`](apps/api/src).

---

## 1. Product in one paragraph

Players send messages as music. Each letter becomes a note on a treble stave, voiced by an instrument chosen by the level. A **coder** posts a challenge — to the open lobby or to one username — optionally staking a chip **pot**. A **decoder** accepts it and guesses letters (or the whole phrase). Every guess costs chips, paid to the coder; wrong guesses cost lives. Solve it and the pot is the decoder's; run out of lives, give up or go quiet for 72 hours and the pot returns to the coder. Reading the stave is the decisive skill: it cuts the chips a decoder spends by about 70% (see [`docs/ECONOMY.md`](docs/ECONOMY.md)).

## 2. The cipher (GT2)

| Item | Rule |
|---|---|
| Alphabet | A–Z (letters, hidden), 0–9 (revealed), space (revealed), `, . ? ! ' -` (revealed). Input is normalised (uppercase, accents stripped, curly quotes and dashes folded). Anything else is **rejected and named**, never silently dropped. Max 80 characters. |
| Letter index | i = 0 (A) … 25 (Z) |
| Key | **k = 0 … 11.** k and k+12 produce identical melodies, so there are exactly 12 keys. Random by default; the coder may choose. |
| Instrument mask | m: piano 0, guitar 1, violin 2, bass 3, synth 4 |
| Pitch | **p = ((i − k) + m) mod 12** (Travis's formula). Written pitch = 60 + p (C4–B4). |
| Bass | Transposing voice: written on the stave at 60 + p, sounds an octave lower. |
| Ambiguity | Every pitch class carries 2–3 letters (A/M/Y, B/N/Z, C/O …). The melody narrows the answer; it never gives it. One revealed letter fixes k: k = (i + m − p) mod 12. |
| Space | Silent rest. |
| Punctuation (violin) | `,` C4 · `-` A4 · `.` C5 · `'` D5 · `?` E5 · `!` G5 |
| Digits (synth) | 0 C4 · 1 D4 · 2 E4 · 3 F4 · 4 G4 · 5 A4 · 6 B4 · 7 C5 · 8 D5 · 9 E5 |

### 2.1 Levels

Higher levels remove information from the client, so difficulty is real rather than cosmetic.

| Level | Voices | What the decoder's device receives | Lives | Chips / guess | Pot range |
|---|---|---|---|---|---|
| 1 Easy | Piano | Stave, colours, note names, Cipher Lab | 8 | 1 | 1–5 |
| 2 Medium | Guitar = vowels, piano = consonants | Stave, colours | 7 | 1 | 2–10 |
| 3 Hard | Piano / guitar alternate by letter | Stave, colours | 6 | 2 | 3–20 |
| 4 Very Hard | All five in a secret random order | Stave, colours | 5 | 2 | 5–40 |
| 5 Expert | All five in a secret random order | Stave only — **instrument withheld** until a letter is revealed | 5 | 3 | 8–80 |
| 6 Master | All five in a secret random order | **Audio only** — no pitch, no instrument until revealed; revealed letters become pitch anchors | 4 | 3 | 15–200 |

The secret voice order (levels 4–6) is drawn server-side from a CSPRNG with rejection sampling (exactly 1/5 per instrument) and stored encrypted with the message.

### 2.2 Motif codebook (v2)

132 figures (130 core + 2 rare) for the phrase layer, auditionable in the app. v2 fixes two same-family duplicates in v1 (`ed`, `er`) and defines that motifs are always separated by a rest when sequenced, which makes any stream uniquely decodable. v1 is preserved unchanged in code (`MOTIFS_V1`). Motif-mode challenges are not part of this build.

## 3. Game rules

- **Accept.** Open challenges are first-come; direct challenges can be accepted only by their recipient. Exactly one accept can succeed, even under concurrency. Before accepting, a decoder sees the card (level, pot, cost, lives, word lengths, coder and rating) — never the notes.
- **Guess a letter.** Costs the level's guess cost (wagered) or nothing (friendly). A hit reveals every occurrence; a miss costs one life. A letter can be guessed once.
- **Solve the phrase.** Costs one guess. Compared on letters and word breaks only (punctuation and digits ignored). Right → solved. Wrong → **2 lives**.
- **Ends.** Solved (all letters revealed or phrase solved), failed (lives exhausted), forfeited (decoder gives up), expired (72 h without a move while active; 7 days unaccepted while open), withdrawn (coder, only while open).
- **Speed bump.** Paid moves are at least 600 ms apart (anti-automation); the first move after accepting is exempt.
- **Reveal.** When a challenge resolves, the decoder and coder see the full message and key.

## 4. Economy (play-money chips)

| Rule | Detail |
|---|---|
| Sources | 100 chips on registration; 15 chips once per UTC day. No purchases, no cash-out in this build. |
| Escrow | The pot leaves the coder's balance into a per-challenge escrow account when posted. |
| Fees | Every paid move pays the guess cost to the **coder**, immediately and non-refundably. |
| Settlement | Solved → pot to decoder minus rake. Failed / forfeited / expired → pot back to coder. Withdrawn / expired-open → pot back to coder. |
| Rake | 5% (configurable `RAKE_BPS`, capped at 20%), rounded down, on pots paid to decoders and on guess fees. |
| Ledger | Double-entry and append-only. Balances can never go negative (database CHECK); the sum of all accounts is always zero (`GET /api/health` reports it). |
| Break-even guidance | Shown to coders when pricing: about 3 / 3 / 6 / 6 / 24 / 31 chips against a strong stave reader and 10 / 10 / 21 / 21 / 32 / 33 against a strong word solver (L1–L6). |

## 5. Ratings and scoreboard

- Elo. A challenge's strength = coder rating + level offset (−300, −150, 0, +150, +300, +450). K = 40 for the first 15 games, then 24. Decoder and coder move in opposite directions. Floor 100. Start 1200.
- **Only wagered lobby challenges are rated.** Direct challenges between friends move chips but never ratings.
- Tiers: Novice < 1000 ≤ Reader < 1300 ≤ Decoder < 1600 ≤ Cipher Hunter < 1900 ≤ Master Ear < 2200 ≤ Grand Cipher.
- Boards: Decoders (rating), Coders (rating, solve rate against, fees earned), This week (solves), By level (solves per level). Updated live.

## 6. Plans (host coders)

| Plan | Live challenges | Create up to | Pot cap | Lobby | Planned price |
|---|---|---|---|---|---|
| Free | 3 | L3 | 1× | — | £0 |
| Coder | 15 | L5 | 1× | — | £8/mo |
| Host | 100 | L6 | 1.5× | Highlighted | £22/mo |
| Studio | 500 | L6 | 2× | Top placement | £49/mo |

Everyone can decode every level. Entitlements are enforced server-side. **Billing is not connected**: prices are display-only; an admin grants plans (`POST /api/admin/plan`).

## 7. Identity

- Unique username: 3–20 characters, letters/numbers/underscore, starting with a letter, case-insensitive, reserved names blocked.
- No email, no password. Registration issues a **130-bit recovery key** (`XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X`), shown once, stored only as an HMAC. Username + recovery key signs in on any other device. Keys can be rotated.
- Sessions: random 256-bit tokens stored as SHA-256 hashes, 90-day sliding expiry. Web uses an HttpOnly, Secure, SameSite=Strict cookie; phones use a bearer token in the device keychain (SecureStore).

## 8. Security properties

- The answer and key never reach a decoder's device before resolution; they are AES-256-GCM encrypted at rest. Keys derive from one secret (`GT_SECRET`) via HKDF.
- Sound files are served under opaque per-note tokens with random silent padding, so the payload never names an instrument or pitch the level withholds.
- Every challenge action takes the next sequence number under a primary key, so concurrent actions cannot both apply; a failed debit rolls back the whole action.
- Mutations require a custom client header (blocks cross-site form posts). Rate limits on registration, sign-in, availability checks, search and admin.
- Residual risk, stated plainly: any puzzle shown on a device can be automated. See D-015.

## 9. API

All under `/api`. JSON. Mutations need header `x-gt-client: web|native`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | — | Status and ledger balance check |
| `GET /config` | — | Levels, tiers, plans, chip constants |
| `GET /auth/available?username=` | — | Username availability |
| `POST /auth/register` | — | `{username}` → user, recovery key, session |
| `POST /auth/signin` | — | `{username, recoveryKey}` → session |
| `POST /auth/signout` | user | End this session |
| `POST /auth/rotate-recovery` | user | New recovery key |
| `GET /me` (`?optional=1`) | user | Profile, balance, escrow, ratings, plan, unseen count |
| `GET /bank` (`?before=`) / `POST /bank/daily` | user | Ledger statement / daily grant |
| `GET /users/search?q=` · `GET /users/:username` | user / — | Recipient search · public profile |
| `POST /challenges/validate` | — | `{message, wagered}` → errors or shape |
| `POST /challenges` | user | `{message, level, pot, key?, recipient?}` |
| `GET /challenges/:id` | role | Card, or score for the decoder/coder |
| `POST /challenges/:id/accept · guess · solve · forfeit · withdraw` | role | Game actions |
| `GET /lobby?sort=&level=` | — | Open challenges, live games, totals |
| `GET /inbox?box=received\|sent` | user | Transmissions |
| `GET /scoreboard?view=decoders\|coders\|week\|level1…6` | — | Boards |
| `GET /sound/:token` | — | Note audio for an opaque token |
| `GET /live` (WebSocket) | optional | Realtime events |
| `POST /admin/plan` | admin token | `{username, plan, days?}` |

Realtime events (`/api/live`): `lobby`, `scoreboard`, `challenge {challengeId}`, `inbox {challengeId}`. Clients refetch on each; the server stays the single source of truth.

## 10. Data model (D1 / SQLite)

`users` · `sessions` · `accounts` (user / escrow / house / mint, balance ≥ 0 except mint) · `ledger` (append-only) · `daily_claims` · `challenges` (encrypted secret, state, seq) · `challenge_events` (append-only, PK challenge_id + seq) · `rate_limits`. Schema: [`apps/api/migrations/0001_init.sql`](apps/api/migrations/0001_init.sql).

## 11. Platform

- Cloudflare Workers **free plan**: one Worker serves the API and the static web app; D1 for data; one SQLite-backed Durable Object (Arena) holds WebSockets using the hibernation API; a cron every 15 minutes expires stale challenges. Over-limit requests fail rather than bill.
- Push to deploy: Cloudflare rebuilds from GitHub on every push to `main`. The default Worker `getting-there` is the preview; production is a separate Worker (`getting-there-live`) and database. The Worker applies its own database migrations on first start.
- App: Expo SDK 58, Expo Router, react-native-svg stave, expo-audio playback of deterministic synthesised samples, TanStack Query; runs in Expo Go unmodified.

## 12. Not in this build (deliberately)

Real-money chips, NFTs and any blockchain; card billing; motif-mode challenges; spectator mode; push notifications; email. Each is a decision for Travis — see the open items in [`docs/DECISIONS.md`](docs/DECISIONS.md).
