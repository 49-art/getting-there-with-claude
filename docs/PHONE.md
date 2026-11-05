# Open it on your phone — Expo Go, SDK 58

The app runs unmodified in **Expo Go** (every native module it uses ships inside Expo Go). The QR code comes from the Expo dev server on your computer, so it is free and needs no Expo account.

## 1 · Install Expo Go

Install **Expo Go** from the App Store or Google Play and update it to the latest version — it must support **SDK 58**.

## 2 · Start the dev server

```bash
npm install          # once, at the top of the repo
npm run phone
```

A QR code appears in the terminal.

- **iPhone:** open the Camera, point it at the QR code, tap the banner.
- **Android:** open Expo Go and choose *Scan QR code*.

Phone and computer must be on the same Wi-Fi. If they can't be (or your network blocks it), use a tunnel instead:

```bash
npm run phone -- --tunnel
```

## 3 · Offline or online

Out of the box the app runs **offline**: Practice (all six levels, real audio) and the motif codebook work, and a banner says no server is configured.

To turn on live play — accounts, lobby, wagers, inbox, scoreboard — tell the app where the API is. Create `apps/mobile/.env`:

```bash
# your Cloudflare preview (see DEPLOY.md)
EXPO_PUBLIC_API_URL=https://getting-there-preview.<your-subdomain>.workers.dev
```

Then restart with `npm run phone -- --clear`.

**Testing against your own computer instead:** run the API on your network address and use your computer's LAN IP:

```bash
npm run api:dev -- --ip 0.0.0.0
# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://192.168.1.23:8787
```

## 4 · Try a full game with two devices

1. Phone A: *Get started* → claim a username → save the recovery key → *Create* → post a Level 2 challenge to the open lobby.
2. Phone B (or the web app at your preview URL): claim another username → *Lobby* → open the challenge → *Accept*.
3. Press ▶ to hear the melody, tap notes to replay them, guess letters, or solve the whole phrase.
4. Watch Phone A: the inbox badge, chip balance and scoreboard update live.

To use the same account on another device: *Get started* → *I have a recovery key*.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Project is incompatible with this version of Expo Go" | Update Expo Go from the store (needs SDK 58) |
| QR scans but loading hangs | Use `npm run phone -- --tunnel`, or check both devices share a network |
| "Can't reach the server" | Check `EXPO_PUBLIC_API_URL`, then restart with `--clear` (env values are read at start-up) |
| No sound on iPhone | Turn the ringer up; the app asks iOS to play even in silent mode, but volume still applies |
