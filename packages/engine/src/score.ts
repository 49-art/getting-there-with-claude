import {
  BASS_TRANSPOSE,
  DIGIT_MIDI,
  INSTRUMENTS,
  KEY_COUNT,
  LETTER_BASE_MIDI,
  MASK,
  PUNCTUATION_MIDI,
  levelSpec,
  type Instrument,
  type Level,
  type Punctuation,
} from './constants.ts';

export const mod = (a: number, n: number): number => ((a % n) + n) % n;

export type Token =
  | {
      kind: 'letter';
      /** Position in the message (characters). */
      index: number;
      /** Position among letters only (0-based). */
      letterPos: number;
      char: string;
      /** Letter index A=0…Z=25. */
      i: number;
      inst: Instrument;
      mask: number;
      /** Pitch class p = (i − k + m) mod 12. */
      pc: number;
      /** Pitch shown on the stave. */
      written: number;
      /** Pitch heard (bass transposes down an octave). */
      sounding: number;
    }
  | { kind: 'space'; index: number }
  | { kind: 'mark'; index: number; char: Punctuation; inst: 'violin'; written: number; sounding: number }
  | { kind: 'digit'; index: number; char: string; inst: 'synth'; written: number; sounding: number };

export interface Score {
  level: Level;
  key: number;
  tokens: Token[];
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** Pitch class for a letter: Travis's formula p = ((i − k) + m) mod 12. */
export function pitchClass(i: number, key: number, inst: Instrument): number {
  return mod(i - key + MASK[inst], 12);
}

/** Letters that land on a pitch class for a given key and instrument (2 or 3 of them). */
export function candidatesFor(pc: number, key: number, inst: Instrument): string[] {
  const out: string[] = [];
  for (let i = 0; i < 26; i++) if (pitchClass(i, key, inst) === pc) out.push(String.fromCharCode(65 + i));
  return out;
}

/** Recover k from one known letter: k = (i + m − p) mod 12. */
export function keyFromReveal(char: string, pc: number, inst: Instrument): number {
  const i = char.charCodeAt(0) - 65;
  return mod(i + MASK[inst] - pc, 12);
}

/**
 * Convert an unbiased random byte stream into instruments (rejection sampling,
 * so each instrument is exactly 1/5 likely). Used for keyed-five levels.
 */
export function voicesFromBytes(bytes: Uint8Array, count: number): Instrument[] {
  const out: Instrument[] = [];
  for (const b of bytes) {
    if (out.length === count) break;
    if (b >= 250) continue; // 250 = 5 × 50, keeps the distribution uniform
    out.push(INSTRUMENTS[b % 5]!);
  }
  if (out.length < count) throw new RangeError(`voicesFromBytes: need more entropy (${out.length}/${count})`);
  return out;
}

/** Bytes needed to draw `count` voices with overwhelming probability. */
export function voiceEntropyBytes(count: number): number {
  return count * 2 + 16;
}

export function voiceFor(level: Level, char: string, letterPos: number, keyed: readonly Instrument[] | undefined): Instrument {
  const rule = levelSpec(level).voices;
  switch (rule) {
    case 'piano':
      return 'piano';
    case 'vowel-split':
      return VOWELS.has(char) ? 'guitar' : 'piano';
    case 'alternate':
      return letterPos % 2 === 0 ? 'piano' : 'guitar';
    case 'keyed-five': {
      const v = keyed?.[letterPos];
      if (!v) throw new RangeError(`Level ${level} needs a keyed voice for letter ${letterPos}`);
      return v;
    }
  }
}

export function soundingFor(inst: Instrument, written: number): number {
  return inst === 'bass' ? written + BASS_TRANSPOSE : written;
}

/**
 * Build the full score for a normalised message. Deterministic for a given
 * (message, key, level, keyed voices). The message must already be validated.
 */
export function buildScore(message: string, key: number, level: Level, keyed?: readonly Instrument[]): Score {
  if (!Number.isInteger(key) || key < 0 || key >= KEY_COUNT) throw new RangeError(`key must be 0–${KEY_COUNT - 1}`);
  const tokens: Token[] = [];
  let letterPos = 0;
  [...message].forEach((ch, index) => {
    if (ch === ' ') {
      tokens.push({ kind: 'space', index });
    } else if (ch in PUNCTUATION_MIDI) {
      const midi = PUNCTUATION_MIDI[ch as Punctuation];
      tokens.push({ kind: 'mark', index, char: ch as Punctuation, inst: 'violin', written: midi, sounding: midi });
    } else if (ch in DIGIT_MIDI) {
      const midi = DIGIT_MIDI[ch]!;
      tokens.push({ kind: 'digit', index, char: ch, inst: 'synth', written: midi, sounding: midi });
    } else if (ch >= 'A' && ch <= 'Z') {
      const i = ch.charCodeAt(0) - 65;
      const inst = voiceFor(level, ch, letterPos, keyed);
      const pc = pitchClass(i, key, inst);
      const written = LETTER_BASE_MIDI + pc;
      tokens.push({ kind: 'letter', index, letterPos, char: ch, i, inst, mask: MASK[inst], pc, written, sounding: soundingFor(inst, written) });
      letterPos++;
    } else {
      throw new RangeError(`buildScore: unsupported character ${JSON.stringify(ch)} — validate first`);
    }
  });
  return { level, key, tokens };
}

/** Number of letters in a message (for keyed voice generation). */
export function letterCount(message: string): number {
  let n = 0;
  for (const ch of message) if (ch >= 'A' && ch <= 'Z') n++;
  return n;
}
