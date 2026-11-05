import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from 'expo-audio';
import { SAMPLE_ASSETS } from './sampleMap';
import { soundUrl } from '../lib/api';

/**
 * Sound bank. A "ref" is either a local sample key (piano_60) used offline,
 * or an opaque server path (/api/sound/<token>) for live challenges, where the
 * client must not learn which instrument it is.
 */
const players = new Map<string, AudioPlayer>();
let modeSet = false;

async function ensureMode() {
  if (modeSet) return;
  modeSet = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  } catch {
    /* web or unsupported */
  }
}

function sourceFor(ref: string): AudioSource | null {
  if (ref.startsWith('/api/')) return { uri: soundUrl(ref) };
  const local = SAMPLE_ASSETS[ref];
  return local === undefined ? null : local;
}

function playerFor(ref: string): AudioPlayer | null {
  let p = players.get(ref);
  if (p) return p;
  const src = sourceFor(ref);
  if (!src) return null;
  p = createAudioPlayer(src);
  players.set(ref, p);
  return p;
}

/** Create players ahead of playback so the first note isn't late. */
export function preload(refs: Iterable<string>): void {
  void ensureMode();
  for (const r of refs) playerFor(r);
}

export function play(ref: string | undefined, volume = 1): void {
  if (!ref) return;
  void ensureMode();
  const p = playerFor(ref);
  if (!p) return;
  try {
    p.volume = volume;
    void p.seekTo(0);
    p.play();
  } catch {
    /* player not ready yet */
  }
}

/** Release players no longer needed (e.g. when leaving a challenge). */
export function release(refs: Iterable<string>): void {
  for (const r of refs) {
    const p = players.get(r);
    if (!p) continue;
    try {
      p.remove();
    } catch {
      /* already released */
    }
    players.delete(r);
  }
}

export function playSequence(refs: string[], gapMs: number): () => void {
  const timers = refs.map((r, i) => setTimeout(() => play(r), i * gapMs));
  return () => timers.forEach(clearTimeout);
}
