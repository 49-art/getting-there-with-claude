import { DIGIT_MIDI, INSTRUMENTS, LETTER_BASE_MIDI, PUNCTUATION_MIDI, type Instrument } from './constants.ts';
import { MOTIFS } from './motifs.ts';
import { soundingFor } from './score.ts';

export interface SampleId {
  inst: Instrument;
  midi: number;
}

export const sampleKey = (inst: Instrument, midi: number): string => `${inst}_${midi}`;

export function parseSampleKey(key: string): SampleId | null {
  const m = /^(piano|guitar|violin|bass|synth)_(\d{2,3})$/.exec(key);
  if (!m) return null;
  return { inst: m[1] as Instrument, midi: Number(m[2]) };
}

/** Every (instrument, sounding pitch) the app can ever play. Sorted, unique. */
export function requiredSamples(): SampleId[] {
  const set = new Set<string>();
  for (const inst of INSTRUMENTS) for (let pc = 0; pc < 12; pc++) set.add(sampleKey(inst, soundingFor(inst, LETTER_BASE_MIDI + pc)));
  for (const midi of Object.values(PUNCTUATION_MIDI)) set.add(sampleKey('violin', midi));
  for (const midi of Object.values(DIGIT_MIDI)) set.add(sampleKey('synth', midi));
  for (const g of MOTIFS) for (const [, , figure] of g.items) for (const midi of figure) set.add(sampleKey(g.inst, soundingFor(g.inst, midi)));
  return [...set]
    .map((k) => parseSampleKey(k)!)
    .sort((a, b) => (a.inst === b.inst ? a.midi - b.midi : INSTRUMENTS.indexOf(a.inst) - INSTRUMENTS.indexOf(b.inst)));
}
