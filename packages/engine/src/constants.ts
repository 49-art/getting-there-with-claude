/**
 * GT cipher constants — the single source of truth for instruments and levels.
 * Every number here is referenced by DECISIONS.md; change it there first.
 */

export const INSTRUMENTS = ['piano', 'guitar', 'violin', 'bass', 'synth'] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

/** Instrument mask m — added to the pitch class (Travis's original formula). */
export const MASK: Record<Instrument, number> = {
  piano: 0,
  guitar: 1,
  violin: 2,
  bass: 3,
  synth: 4,
};

/** Brand colours per instrument (from the original prototype). */
export const INSTRUMENT_COLOUR: Record<Instrument, string> = {
  piano: '#F5C542',
  guitar: '#00E5FF',
  violin: '#FF2E88',
  bass: '#A06BFF',
  synth: '#38E08A',
};

/** Family roles (PianoCipher identity): which instrument carries which job. */
export const INSTRUMENT_ROLE: Record<Instrument, string> = {
  guitar: 'Vowels',
  piano: 'Consonants & words',
  violin: 'Punctuation',
  bass: 'Spacing & low voice',
  synth: 'Prefixes & numbers',
};

/** Effective key space. k and k+12 produce identical melodies, so only 12 keys exist. */
export const KEY_COUNT = 12;

/** Base written pitch for letters: C4. Letters always sit in C4–B4 on the stave. */
export const LETTER_BASE_MIDI = 60;

/** Bass is a transposing voice: written on the stave, sounds an octave lower. */
export const BASS_TRANSPOSE = -12;

export const PUNCTUATION = [',', '.', '?', '!', "'", '-'] as const;
export type Punctuation = (typeof PUNCTUATION)[number];

/** Punctuation is structural (always revealed) and voiced on violin. */
export const PUNCTUATION_MIDI: Record<Punctuation, number> = {
  ',': 60, // C4
  '-': 69, // A4
  '.': 72, // C5
  "'": 74, // D5
  '?': 76, // E5
  '!': 79, // G5
};

/** Digits are structural (always revealed) and voiced on synth (original C-major map). */
export const DIGIT_MIDI: Record<string, number> = {
  '0': 60,
  '1': 62,
  '2': 64,
  '3': 65,
  '4': 67,
  '5': 69,
  '6': 71,
  '7': 72,
  '8': 74,
  '9': 76,
};

export type VoiceRule = 'piano' | 'vowel-split' | 'alternate' | 'keyed-five';

export interface LevelAids {
  /** Show note names (C4, F#4…) under notes. */
  noteNames: boolean;
  /** Colour noteheads by instrument (reveals instrument visually). */
  colours: boolean;
  /** Show the Cipher Lab derivation panel. */
  cipherLab: boolean;
  /** Show the stave at all. False = audio-only (Master). */
  staff: boolean;
  /** Instrument of an unrevealed letter is withheld from the client (ear only). */
  instrumentHidden: boolean;
}

export interface LevelEconomy {
  /** Wrong letter guesses allowed before the challenge fails. */
  lives: number;
  /** Chips paid by the decoder for every letter guess or solve attempt. */
  guessCost: number;
  /** Allowed prize-pot range in chips for wagered challenges. */
  potMin: number;
  potMax: number;
}

export interface LevelSpec extends LevelEconomy {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  voices: VoiceRule;
  aids: LevelAids;
  /** Default playback tempo in notes per minute. */
  tempo: number;
  /** Rating offset of a challenge at this level relative to its coder (Elo points). */
  ratingOffset: number;
  blurb: string;
}

/**
 * Level table. Lives / costs / pots calibrated by scripts/simulate.ts
 * (see docs/ECONOMY.md for the evidence). Higher levels remove information,
 * so difficulty is real rather than cosmetic.
 */
export const LEVELS: readonly LevelSpec[] = [
  {
    level: 1,
    name: 'Easy',
    voices: 'piano',
    aids: { noteNames: true, colours: true, cipherLab: true, staff: true, instrumentHidden: false },
    lives: 8,
    guessCost: 1,
    potMin: 1,
    potMax: 5,
    tempo: 60,
    ratingOffset: -300,
    blurb: 'Piano only. Note names and the Cipher Lab are on. Learn the stave.',
  },
  {
    level: 2,
    name: 'Medium',
    voices: 'vowel-split',
    aids: { noteNames: false, colours: true, cipherLab: false, staff: true, instrumentHidden: false },
    lives: 7,
    guessCost: 1,
    potMin: 2,
    potMax: 10,
    tempo: 66,
    ratingOffset: -150,
    blurb: 'Guitar carries vowels, piano carries consonants. Note names off.',
  },
  {
    level: 3,
    name: 'Hard',
    voices: 'alternate',
    aids: { noteNames: false, colours: true, cipherLab: false, staff: true, instrumentHidden: false },
    lives: 6,
    guessCost: 2,
    potMin: 3,
    potMax: 20,
    tempo: 72,
    ratingOffset: 0,
    blurb: 'Piano and guitar alternate. Two masks to track.',
  },
  {
    level: 4,
    name: 'Very Hard',
    voices: 'keyed-five',
    aids: { noteNames: false, colours: true, cipherLab: false, staff: true, instrumentHidden: false },
    lives: 5,
    guessCost: 2,
    potMin: 5,
    potMax: 40,
    tempo: 80,
    ratingOffset: 150,
    blurb: 'All five voices in a secret order. Colours still tell you which.',
  },
  {
    level: 5,
    name: 'Expert',
    voices: 'keyed-five',
    aids: { noteNames: false, colours: false, cipherLab: false, staff: true, instrumentHidden: true },
    lives: 5,
    guessCost: 3,
    potMin: 8,
    potMax: 80,
    tempo: 88,
    ratingOffset: 300,
    blurb: 'Five voices, no colours. Identify each instrument by ear.',
  },
  {
    level: 6,
    name: 'Master',
    voices: 'keyed-five',
    aids: { noteNames: false, colours: false, cipherLab: false, staff: false, instrumentHidden: true },
    lives: 4,
    guessCost: 3,
    potMin: 15,
    potMax: 200,
    tempo: 92,
    ratingOffset: 450,
    blurb: 'Audio only. No stave, no colours. Pitch and timbre by ear.',
  },
] as const;

export type Level = LevelSpec['level'];

export function levelSpec(level: number): LevelSpec {
  const spec = LEVELS.find((l) => l.level === level);
  if (!spec) throw new RangeError(`Unknown level ${level}`);
  return spec;
}

export const MESSAGE_LIMITS = {
  maxChars: 80,
  minLettersFriendly: 2,
  minLettersWagered: 6,
  minDistinctWagered: 4,
} as const;

/** Chip economy constants (play-money; no real-money purchases in this build). */
export const CHIPS = {
  starterGrant: 100,
  dailyGrant: 15,
  /** House rake in basis points, applied to winnings that move between players. */
  defaultRakeBps: 500,
} as const;
