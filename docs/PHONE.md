# Open it on your phone — Expo Go, SDK 58

**Quickest:** once the app is on Cloudflare, just open `https://getting-there.<your-subdomain>.workers.dev` in your phone's browser and use *Add to Home Screen*. It is the same app. The steps below are for the native version in Expo Go.

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

To turn on live play — accounts, lobby, wagers, inbox, scoreboard — give it your preview address once:

```bash
npm run phone -- https://getting-there.<your-subdomain>.workers.dev
```

The address is saved, so from then on `npm run phone` is enough.

**Testing against your own computer instead:** run the API on your network address and pass your computer's LAN IP:

```bash
npm run api:dev -- --ip 0.0.0.0
npm run phone -- http://192.168.1.23:8787
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
| "Can't reach the server" | Run `npm run phone -- <your address>` again to re-save it (it restarts with a clean cache) |
| No sound on iPhone | Turn the ringer up; the app asks iOS to play even in silent mode, but volume still applies |
