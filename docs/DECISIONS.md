# Decision log — getting-there

Foundry rules apply: every non-trivial decision is logged with its rationale; ambiguity is flagged rather than silently resolved; nothing is deleted, only superseded.

Status key: **Built** = implemented and tested in this repo. **Needs Travis** = built as the safest default, awaiting Travis's sign-off. Earlier war-room locks (ADR-001, ADR-002 and the Section 14 defaults) are superseded where stated, not erased; the original prototype is untouched.

| ID | Decision | Status |
|---|---|---|
| D-001 | Keep Travis's formula p = ((i − k) + m) mod 12; key range 0–11 | Built · Needs Travis |
| D-002 | Server-authoritative challenges; answer never on the decoder's device | Built |
| D-003 | Lives, non-refundable fees to the coder, escrowed pot | Built |
| D-004 | Lives 8/7/6/5/5/4 from simulation; costs and pots kept from the brief | Built · Needs Travis |
| D-005 | Levels 5 and 6 withhold information | Built · Needs Travis |
| D-006 | Opaque sound tokens with random padding | Built |
| D-007 | Wagered messages must be real words | Built |
| D-008 | Punctuation pitches moved; spaces silent | Built · Needs Travis |
| D-009 | Bass is a transposing voice | Built |
| D-010 | Motif codebook v2 | Built · Needs Travis |
| D-011 | Username + recovery key; no email, no password | Built |
| D-012 | Plans enforced, billing not connected | Built · Needs Travis |
| D-013 | No blockchain in this build | Built · Needs Travis |
| D-014 | Cloudflare architecture | Built |
| D-015 | Automation risk and mitigations | Built · Needs Travis |
| D-016 | Ratings only from wagered lobby challenges | Built |
| D-017 | Preview is the default Worker; production is separate | Built |
| D-018 | Concurrency and ledger integrity | Built |
| D-019 | Time-outs | Built |
| D-020 | Removed the Expo template's MIT licence | Built |
| D-021 | Rate limits | Built |
| D-022 | Dependencies: open source, established | Built |
| D-023 | Push to deploy from GitHub | Built |
| D-024 | The Worker migrates its own database | Built |
| D-025 | Preview generates its own key; production must be given one | Built |

---

### D-001 · Cipher formula kept; key range 0–11
**Decision.** p = ((i − k) + m) mod 12 exactly as Travis wrote it. The key is chosen from 0–11.
**Why.** k and k+12 produce identical melodies (proved in `engine.test.ts`: 26 inputs give 12 distinct melodies). Offering 26 keys implied secrecy that wasn't there.
**Supersedes.** Prototype and brief "k = 0–25". **Needs Travis:** confirm the 12-key framing in marketing copy.

### D-002 · Server-authoritative play
**Decision.** The server holds each challenge's message, key and voice order, AES-256-GCM encrypted. A decoder's device receives only what the level allows (pitches, instruments, revealed letters) plus opaque sound tokens. Guesses are validated on the server. Practice mode runs the same engine locally with no stakes.
**Why.** GT1 codes carry the message in base64; with wagering, anyone opening devtools would win every pot.
**Supersedes.** ADR-001 "Plaintext policy: GT1 embedded; no plaintext column". GT1 codes are retired for live play (the prototype keeps them).

### D-003 · Settlement model
**Decision.** Pot escrowed when posted. Each paid move pays the guess cost to the coder, never refunded. Solve → pot to decoder; otherwise pot back to coder. Wrong phrase attempt = 2 lives.
**Why.** Under "winner takes pot + all guess chips" with no lives, a decoder could guess all 26 letters and always win at zero cost.
**Supersedes.** Brief §6.2 / Section 14 default "winner takes coder pot + all decoder guess chips".

### D-004 · Calibrated lives
**Decision.** Lives 8, 7, 6, 5, 5, 4 for L1–L6. Guess costs (1, 1, 2, 2, 3, 3) and pot ranges kept from the brief. Break-even pots shown to coders.
**Why.** `npm run simulate` (1,000 real phrases per level, four decoder strategies) — beginners win 28% at Easy and 3% at Master; stave readers need about 3 paid moves at L1–L4 versus about 10 for a perfect word solver. Evidence in `docs/ECONOMY.md`.
**Needs Travis:** pot ranges above the break-even line are headline prizes coders should expect to pay out; keep or tighten.

### D-005 · Information-withholding levels
**Decision.** L5 = five keyed voices with instruments withheld until a letter is revealed (identify timbre by ear). L6 = audio only, no pitch or instrument until revealed; revealed letters become anchors.
**Why.** In the prototype the instrument colour and the Cipher Lab gave everything away, so Level 6 played like Level 1.
**Supersedes.** L5 "rotating all five by position" (position mod 5 would reveal the instrument). L1–L4 rules unchanged.

### D-006 · Opaque sound tokens
**Decision.** Each note's audio is fetched via `/api/sound/<token>`, where the token is deterministic AES-GCM over (challenge, position, instrument, pitch) and each response adds 0–47 random silent samples at each end.
**Why.** File names would reveal what L5/L6 withhold; padding stops trivial byte fingerprinting.

### D-007 · Fair wagered messages
**Decision.** Wagered messages: every word in the SCOWL dictionary (size ≤ 60, English/American/British, 79,308 words; contractions via their stem), at least 6 letters and 4 distinct letters. Friendly messages are unrestricted.
**Why.** Gibberish plus limited lives would let coders farm decoders' fees.

### D-008 · Structural pitches
**Decision.** Punctuation: `,` C4, `-` A4, `.` C5, `'` D5, `?` E5, `!` G5 (violin). Digits keep the prototype map. Spaces are silent rests.
**Why.** The prototype put `!` on C7 (many ledger lines), and `'` and `-` had no voice. **Needs Travis** to confirm.

### D-009 · Bass transposes
**Decision.** Bass letters are written on the stave at C4–B4 and sound an octave lower — the real convention for bass guitar, and what the prototype's synth already did.

### D-010 · Motif codebook v2
**Decision.** `ed` 67 71 → 67 72 and `er` 69 74 (they duplicated piano `g` and `h`). Motifs are separated by a rest when sequenced, which makes the code uniquely decodable even where one figure begins another. v1 is kept verbatim as `MOTIFS_V1`.
**Needs Travis.** The codebook overlaps the PianoCipher system that is being prepared for sale or licence and has a co-creator; confirm who owns it before it ships here.

### D-011 · Identity
**Decision.** Unique username plus a 130-bit recovery key; no email or password. Sessions are hashed bearer tokens (SecureStore on phones) or an HttpOnly cookie on web.
**Why.** Passkeys need native modules that Expo Go does not include; email needs a paid sender; passwords on the Workers free plan would need a slow hash within a 10 ms CPU budget. A high-entropy key can be stored as a fast HMAC safely.
**Supersedes.** ADR-001 "passkey-first with fallback".

### D-012 · Plans without billing
**Decision.** Free / Coder / Host / Studio entitlements enforced; prices display-only; admin grants plans.
**Why.** No open-source card processor exists, and connecting a paid one breaks "no unexpected charges". BTCPay Server (open source) is the route if crypto payments are wanted. **Needs Travis:** prices and processor.

### D-013 · No blockchain yet
**Decision.** Chips are play-money in a double-entry ledger with an `external_ref` column reserved for a future on-chain transaction hash. No NFTs, no wallet.
**Why.** Gas costs are charges; smart contracts need audits; app-store rules restrict NFT-unlocked features on iOS; real-money wagering needs licensing. **Supersedes** ADR-001 "Base L2 in v1". **Needs Travis:** Phase 3 decision.

### D-014 · Cloudflare architecture
**Decision.** One Worker (Hono) serves `/api/*` and the exported web app as static assets; D1 is the database; one SQLite-backed Durable Object ("Arena") holds WebSockets with the hibernation API; a 15-minute cron expires stale challenges.
**Why.** Everything here is on the Workers free plan, where over-limit requests fail rather than bill. **Supersedes** ADR-002 "SSE + Postgres LISTEN/NOTIFY" — there is no Postgres on Cloudflare, and Durable Object WebSockets are the platform's free, hibernating equivalent. ADR-002's envelope idea survives as small typed events plus refetch.

### D-015 · Automation risk
**Position.** Any puzzle shown on a device can be automated. The simulation's worst-case bot (perfect perception, all 12 keys tested) wins every game. Mitigations built: L5/L6 withhold data so a cheat must analyse audio; opaque, padded sound tokens; a 600 ms speed bump; ratings only from lobby play. **Needs Travis:** before chips carry real value, add human verification and statistical cheat detection.

### D-016 · Rating integrity
**Decision.** Only wagered lobby challenges move ratings and scoreboard stats. Direct challenges move chips only. Decoders may hold at most 5 active decodes.
**Why.** Closes the easiest farming route (posting easy challenges to your own second account).

### D-017 · Preview and production
**Decision.** The default Worker, `getting-there-with-claude` (database `getting-there-db`), is the preview — renamed from `getting-there` to match the Cloudflare project Travis created. Production is `--env production`: Worker `getting-there-live`, database `getting-there-live-db`.
**Why.** Cloudflare does not generate preview URLs for Workers that implement a Durable Object, and push-to-deploy builds deploy the default Worker. **Supersedes** the first version of this decision (`--env preview` / `getting-there-preview`).

### D-018 · Concurrency and ledger integrity
**Decision.** Each action inserts the next (challenge_id, seq) event; a concurrent action collides on the primary key and its whole batch — including chip movements — rolls back. Balances have a CHECK ≥ 0; ledger and event tables reject UPDATE and DELETE by trigger.
**Evidence.** Smoke test: 10 concurrent accepts → exactly one succeeds; 4 identical concurrent guesses → one lands; ledger sums to zero.

### D-019 · Time-outs
**Decision.** Active with no move for 72 h → expired (counts as a loss for the decoder). Open for 7 days → expired with a full refund.

### D-020 · Template licence removed
**Decision.** Deleted `apps/mobile/LICENSE`, the MIT licence copied in by `create-expo-app` (copyright Expo). It would have published the app under a licence Travis didn't choose. The repo is private and unlicensed.

### D-021 · Rate limits
Registration 8/hour/IP; sign-in 20/hour/IP and 10/hour/username; availability 60/min/IP; search 120/min/user; admin 30/hour/IP. Relaxed ×100 only when `GT_ENV=development`.

### D-022 · Dependencies
All libraries are open source and established more than a year: Hono, TanStack Query, Expo SDK modules, react-native-svg, Bravura glyphs (via VexFlow), SCOWL word lists, Google Fonts (OFL). Cloudflare itself is a proprietary platform — Travis's choice of host. Full list: `THIRD_PARTY_NOTICES.md`.

### D-023 · Push to deploy
**Decision.** The Cloudflare config lives at the repo root so the dashboard's "Import a repository" works with defaults: build `npm ci && npm run build`, deploy `npx wrangler deploy`. Every push to `main` goes live.
**Why.** Matches the GitHub → Cloudflare pipeline Travis already uses with Grok; no terminal needed.

### D-024 · Self-migrating database
**Decision.** On first request the Worker applies any migration missing from `d1_migrations` (the table Wrangler uses, so both routes agree). The D1 database is found by name or created on first deploy.
**Why.** Removes every manual database step from push-to-deploy. Tested on a fresh database: 94/94 smoke checks; `wrangler d1 migrations apply` then reports nothing to apply.

### D-025 · Preview key
**Decision.** If `GT_SECRET` is not set and the Worker is not production, it generates one and keeps it in its own database (`app_config`). Production refuses to run without a real `GT_SECRET`. `/api/health` reports which is in use.
**Trade-off, stated once:** on the preview the key sits in the same database as the data it protects, which is weaker than a Cloudflare secret. Fine for a preview with test users; set a real key (`npm run cf:setup`) before real people sign up.

---

## Open items for Travis

1. Plan prices and whether to take payments (and how).
2. Phase 3: real-value chips, NFTs, chain — and the legal and app-store work that comes with them.
3. Ownership of the motif codebook relative to the PianoCipher sale.
4. Rake percentage (5% now).
5. Pot ranges above the break-even line (D-004).
