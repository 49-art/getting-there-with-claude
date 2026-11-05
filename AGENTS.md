# Working in this repo (for AI agents and new team members)

1. **Read [`SPEC.md`](SPEC.md) first.** It is the only source of truth for product rules. This product is GT: GET THIS — a musical letter-to-pitch cipher arena with chip wagers, a lobby, an inbox and a live scoreboard. It is not a collaborative notation editor, and there is no "Travis Cipher family" or KDF in it.
2. **Decisions belong to Travis.** Do not change a rule in `SPEC.md` or a decision in [`docs/DECISIONS.md`](docs/DECISIONS.md) on your own. Propose it, log it as *Needs Travis*, and wait.
3. **Log every non-trivial decision** in `docs/DECISIONS.md` with its rationale and what it supersedes. Never delete work; supersede it.
4. **Constants live in one place:** `packages/engine/src/constants.ts`. The server enforces them; the app reads them. Don't copy numbers into other files.
5. **Before you say "done":** `npm test`, `npm run typecheck`, `npm run lint`, and `npm run smoke` against a running Worker must all pass. If you change the economy, rerun `npm run simulate` and update `docs/ECONOMY.md` with `WRITE=1`.
6. **Expo:** the app targets SDK 58 and must keep running in Expo Go — only use modules Expo Go includes, and install with `npx expo install`. See `apps/mobile/AGENTS.md`.
7. **Cloudflare:** free plan only. Do not add KV, R2, Queues, Workers AI, Logpush or anything that can bill. Pushes to `main` deploy the preview Worker automatically; production is `--env production` and is Travis's call only.
8. **Security invariants:** a decoder's device must never receive the answer, the key, or (at L5–L6) withheld instruments or pitches before resolution. The ledger is append-only and must always sum to zero.
