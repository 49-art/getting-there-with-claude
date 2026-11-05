import type { Instrument } from './constants.ts';

export interface MotifGroup {
  group: string;
  inst: Instrument;
  items: ReadonlyArray<readonly [id: string, cluster: string, midis: readonly number[]]>;
}

/**
 * GT Motif Codebook v1 — preserved exactly as authored in the original
 * prototype. Superseded by v2 below (not deleted, per Foundry rules).
 * Known defects (proved in packages/engine/test/motifs.test.ts):
 *  - piano 'g' and 'ed' share 67 71; piano 'h' and 'er' share 69 72
 *  - many motifs are prefixes of others in the same family
 */
export const MOTIFS_V1: readonly MotifGroup[] = [
  { group: 'Single vowels', inst: 'guitar', items: [['M001', 'a', [60, 64]], ['M002', 'e', [62, 67]], ['M003', 'i', [64, 69]], ['M004', 'o', [65, 69]], ['M005', 'u', [67, 72]]] },
  { group: 'Vowel clusters', inst: 'guitar', items: [['M006', 'ae', [60, 64, 69]], ['M007', 'ai', [62, 69, 64]], ['M008', 'ao', [60, 65, 69]], ['M009', 'au', [62, 67, 72]], ['M010', 'ea', [64, 60, 69]], ['M011', 'ee', [64, 64, 67]], ['M012', 'ei', [65, 69, 74]], ['M013', 'eo', [67, 64, 72]], ['M014', 'eu', [69, 64, 71]], ['M015', 'ia', [71, 67, 64]], ['M016', 'ie', [72, 69, 65]], ['M017', 'io', [74, 71, 67]], ['M018', 'oa', [76, 72, 69]], ['M019', 'oe', [77, 74, 71]], ['M020', 'oi', [79, 76, 72]], ['M021', 'oo', [67, 67, 69]], ['M022', 'ou', [69, 65, 74]], ['M023', 'ua', [71, 67, 76]], ['M024', 'ue', [72, 69, 77]], ['M025', 'ui', [74, 71, 79]]] },
  { group: 'Single consonants', inst: 'piano', items: [['M026', 'b', [60, 62]], ['M027', 'c', [62, 65]], ['M028', 'd', [64, 67]], ['M029', 'f', [65, 69]], ['M030', 'g', [67, 71]], ['M031', 'h', [69, 72]], ['M032', 'j', [71, 74]], ['M033', 'k', [72, 76]], ['M034', 'l', [74, 77]], ['M035', 'm', [76, 79]], ['M036', 'n', [77, 81]], ['M037', 'p', [79, 83]], ['M038', 'q', [81, 84]], ['M039', 'r', [83, 86]], ['M040', 's', [60, 59]], ['M041', 't', [62, 60]], ['M042', 'v', [64, 62]], ['M043', 'w', [65, 64]], ['M044', 'x', [67, 65]], ['M045', 'y', [69, 67]], ['M046', 'z', [71, 69]]] },
  { group: 'Consonant clusters', inst: 'piano', items: [['M047', 'bl', [60, 64, 62]], ['M048', 'br', [62, 65, 64]], ['M049', 'ch', [64, 67, 65]], ['M050', 'ck', [65, 69, 67]], ['M051', 'cl', [67, 71, 69]], ['M052', 'cr', [69, 72, 71]], ['M053', 'dr', [71, 74, 72]], ['M054', 'fl', [72, 76, 74]], ['M055', 'fr', [74, 77, 76]], ['M056', 'gh', [76, 79, 77]], ['M057', 'gl', [77, 81, 79]], ['M058', 'gn', [79, 83, 81]], ['M059', 'gr', [81, 84, 83]], ['M060', 'kn', [83, 86, 84]], ['M061', 'll', [60, 60, 64]], ['M062', 'mb', [62, 65, 62]], ['M063', 'mm', [64, 64, 67]], ['M064', 'mp', [65, 69, 65]], ['M065', 'nd', [67, 71, 67]], ['M066', 'ng', [69, 72, 69]], ['M067', 'nk', [71, 74, 71]], ['M068', 'nn', [72, 72, 76]], ['M069', 'ph', [74, 77, 74]], ['M070', 'pl', [76, 79, 76]], ['M071', 'pr', [77, 81, 77]], ['M072', 'qu', [79, 83, 79]], ['M073', 'sc', [81, 84, 81]], ['M074', 'sh', [83, 86, 83]], ['M075', 'sk', [60, 64, 60]]] },
  { group: 'Word endings', inst: 'piano', items: [['M076', 'ing', [60, 64, 67, 72]], ['M077', 'tion', [62, 65, 69, 74]], ['M078', 'ness', [64, 67, 71, 76]], ['M079', 'ment', [65, 69, 72, 77]], ['M080', 'able', [74, 71, 67, 64]], ['M081', 'ed', [67, 71]], ['M082', 'er', [69, 72]], ['M083', 'est', [71, 74, 67]], ['M084', 'ful', [72, 76, 69]], ['M085', 'ily', [74, 77, 71]], ['M086', 'ish', [76, 79, 72]], ['M087', 'ity', [77, 81, 74]], ['M088', 'less', [79, 83, 76]], ['M089', 'ly', [81, 77]], ['M090', 'ous', [83, 79, 76]]] },
  { group: 'Prefixes', inst: 'synth', items: [['M091', 'pre', [60, 64, 62, 67]], ['M092', 'pro', [62, 65, 64, 69]], ['M093', 're', [64, 67]], ['M094', 'un', [65, 69, 67]], ['M095', 'dis', [67, 71, 69, 67]], ['M096', 'con', [69, 72, 71]], ['M097', 'ex', [71, 74]], ['M098', 'in', [72, 76]], ['M099', 'mis', [74, 77, 76, 74]], ['M100', 'sub', [76, 79, 77, 76]]] },
  { group: 'Common short words', inst: 'piano', items: [['M101', 'the', [60, 64, 67]], ['M102', 'and', [62, 65, 69]], ['M103', 'for', [64, 67, 71]], ['M104', 'not', [65, 69, 72]], ['M105', 'are', [67, 71, 74]], ['M106', 'was', [69, 72, 76]], ['M107', 'you', [71, 74, 77]], ['M108', 'his', [72, 76, 79]], ['M109', 'her', [74, 77, 81]], ['M110', 'they', [76, 79, 83]], ['M111', 'with', [77, 81, 84]], ['M112', 'this', [79, 83, 86]], ['M113', 'from', [81, 84, 88]], ['M114', 'that', [83, 86, 89]], ['M115', 'have', [60, 64, 69, 67]]] },
  { group: 'Punctuation', inst: 'violin', items: [['M116', 'space', []], ['M117', '.', [60, 48]], ['M118', ',', [62, 50]], ['M119', '?', [64, 59, 64]], ['M120', '!', [67, 79, 67]]] },
  { group: 'Numbers', inst: 'synth', items: [['M121', '0', [60]], ['M122', '1', [62]], ['M123', '2', [64]], ['M124', '3', [65]], ['M125', '4', [67]], ['M126', '5', [69]], ['M127', '6', [71]], ['M128', '7', [72]], ['M129', '8', [74]], ['M130', '9', [76]]] },
  { group: 'Rare clusters', inst: 'synth', items: [['MX1', 'xtr', [60, 64, 67, 71]], ['MX2', 'sch', [62, 65, 69, 72]]] },
];

/**
 * GT Motif Codebook v2 — v1 with its defects fixed:
 *  1. 'ed' 67 71 → 67 72 and 'er' 69 72 → 69 74, so no two motifs in one
 *     instrument family share a figure (fully distinguishable by family + pitch).
 *  2. Motifs are always delimited by a boundary (a rest) when played in
 *     sequence, which makes the code uniquely decodable even where one
 *     figure begins another. `isUniquelyDecodable` proves this.
 */
export const MOTIF_V2_CHANGES: Readonly<Record<string, readonly number[]>> = {
  M081: [67, 72],
  M082: [69, 74],
};

export const MOTIFS_V2: readonly MotifGroup[] = MOTIFS_V1.map((g) => ({
  ...g,
  items: g.items.map(([id, cl, m]) => [id, cl, MOTIF_V2_CHANGES[id] ?? m] as const),
}));

export const MOTIFS = MOTIFS_V2;

export interface MotifCollision {
  inst: Instrument;
  figure: string;
  clusters: string[];
}

/** Motifs in the same family with identical figures (ambiguous by ear and on paper). */
export function motifCollisions(book: readonly MotifGroup[]): MotifCollision[] {
  const seen = new Map<string, { inst: Instrument; clusters: string[] }>();
  for (const g of book) {
    for (const [, cl, m] of g.items) {
      if (m.length === 0) continue;
      const key = `${g.inst}|${m.join(' ')}`;
      const entry = seen.get(key) ?? { inst: g.inst, clusters: [] };
      entry.clusters.push(cl);
      seen.set(key, entry);
    }
  }
  return [...seen.entries()]
    .filter(([, v]) => v.clusters.length > 1)
    .map(([k, v]) => ({ inst: v.inst, figure: k.split('|')[1]!, clusters: v.clusters }));
}

/** Same-family motifs whose figure is a proper prefix of another's. */
export function motifPrefixPairs(book: readonly MotifGroup[]): Array<[string, string, Instrument]> {
  const flat = book.flatMap((g) => g.items.filter(([, , m]) => m.length).map(([, cl, m]) => ({ cl, inst: g.inst, fig: m.join(' ') })));
  const out: Array<[string, string, Instrument]> = [];
  for (const a of flat) for (const b of flat) if (a !== b && a.inst === b.inst && b.fig.startsWith(`${a.fig} `)) out.push([a.cl, b.cl, a.inst]);
  return out;
}

/**
 * With boundaries between motifs, a stream is uniquely decodable iff every
 * (family, figure) pair is unique. Returns true for v2.
 */
export function isUniquelyDecodable(book: readonly MotifGroup[]): boolean {
  return motifCollisions(book).length === 0;
}

export function motifCount(book: readonly MotifGroup[]): { core: number; rare: number } {
  let core = 0;
  let rare = 0;
  for (const g of book) {
    for (const [id] of g.items) {
      if (id.startsWith('MX')) rare++;
      else core++;
    }
  }
  return { core, rare };
}
