import { mod } from './score.ts';

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const LETTER_STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/** Scientific pitch name, e.g. 60 → "C4". */
export function noteName(midi: number): string {
  return `${PITCH_NAMES[mod(midi, 12)]}${Math.floor(midi / 12) - 1}`;
}

export function isSharp(midi: number): boolean {
  return PITCH_NAMES[mod(midi, 12)]!.length > 1;
}

/** Diatonic step number (C-1 = 0), used to place notes on the stave. */
export function diatonicStep(midi: number): number {
  const octave = Math.floor(midi / 12) - 1;
  return octave * 7 + LETTER_STEP[PITCH_NAMES[mod(midi, 12)]![0]!]!;
}

/** Treble stave reference: bottom line E4, top line F5. */
export const TREBLE = {
  bottomLine: diatonicStep(64),
  topLine: diatonicStep(77),
  middleLine: diatonicStep(71),
} as const;

export interface StavePlacement {
  /** Steps above the bottom line (each step = half a line gap). */
  step: number;
  /** Ledger lines needed, as step offsets from the bottom line. */
  ledgers: number[];
  sharp: boolean;
  /** Stem goes up for notes below the middle line. */
  stemUp: boolean;
}

/** Everything a renderer needs to draw a notehead on the treble stave. */
export function placeOnTreble(midi: number): StavePlacement {
  const d = diatonicStep(midi);
  const step = d - TREBLE.bottomLine;
  const ledgers: number[] = [];
  if (d < TREBLE.bottomLine) for (let s = -2; s >= step; s -= 2) ledgers.push(s);
  const top = TREBLE.topLine - TREBLE.bottomLine;
  if (d > TREBLE.topLine) for (let s = top + 2; s <= step; s += 2) ledgers.push(s);
  return { step, ledgers, sharp: isSharp(midi), stemUp: d < TREBLE.middleLine };
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
