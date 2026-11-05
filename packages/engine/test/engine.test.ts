import { describe, expect, it } from 'vitest';
import {
  CHIPS,
  INSTRUMENTS,
  KEY_COUNT,
  LEVELS,
  MOTIFS_V1,
  MOTIFS_V2,
  applyGuess,
  applySolve,
  buildScore,
  candidatesFor,
  checkPot,
  dictionaryAccepts,
  expectedScore,
  feeTransfers,
  isUniquelyDecodable,
  keyFromReveal,
  livesLeft,
  motifCollisions,
  motifCount,
  motifPrefixPairs,
  newGame,
  normaliseMessage,
  placeOnTreble,
  noteName,
  projectScore,
  rakeOf,
  rateChallenge,
  requiredSamples,
  sampleKey,
  settlementTransfers,
  tierFor,
  validateMessage,
  voicesFromBytes,
  type Instrument,
  type Level,
} from '../src/index.ts';

const pianoKeyed = (n: number): Instrument[] => Array.from({ length: n }, (_, i) => INSTRUMENTS[i % 5]!);
const soundRef = (inst: Instrument, midi: number) => sampleKey(inst, midi);

describe('cipher mapping', () => {
  it("implements Travis's formula p = ((i − k) + m) mod 12", () => {
    const s = buildScore('AZ', 5, 1);
    const [a, z] = s.tokens;
    expect(a).toMatchObject({ kind: 'letter', pc: (0 - 5 + 12) % 12, written: 60 + 7 });
    expect(z).toMatchObject({ kind: 'letter', pc: (25 - 5) % 12, written: 60 + 8 });
  });

  it('is deterministic', () => {
    const a = buildScore('KEEP BUILDING', 3, 4, pianoKeyed(12));
    const b = buildScore('KEEP BUILDING', 3, 4, pianoKeyed(12));
    expect(a).toEqual(b);
  });

  it('has exactly 12 effective keys (k and k+12 were identical in GT1)', () => {
    expect(KEY_COUNT).toBe(12);
    expect(() => buildScore('ABC', 12, 1)).toThrow(RangeError);
    const melodies = new Set(Array.from({ length: 12 }, (_, k) => JSON.stringify(buildScore('KEEP BUILDING DIGNITY', k, 1).tokens.map((t) => ('pc' in t ? t.pc : -1)))));
    expect(melodies.size).toBe(12);
  });

  it('maps every pitch class to 2 or 3 letters', () => {
    for (let pc = 0; pc < 12; pc++) {
      const c = candidatesFor(pc, 0, 'piano');
      expect(c.length).toBeGreaterThanOrEqual(2);
      expect(c.length).toBeLessThanOrEqual(3);
    }
    expect(candidatesFor(0, 0, 'piano')).toEqual(['A', 'M', 'Y']);
  });

  it('recovers the key from a single revealed letter', () => {
    for (let k = 0; k < 12; k++) {
      for (const inst of INSTRUMENTS) {
        const s = buildScore('Q', k, 4, [inst]);
        const t = s.tokens[0]!;
        if (t.kind !== 'letter') throw new Error('expected letter');
        expect(keyFromReveal('Q', t.pc, inst)).toBe(k);
      }
    }
  });

  it('assigns voices by level rule', () => {
    const l2 = buildScore('AB', 0, 2).tokens;
    expect(l2.map((t) => (t.kind === 'letter' ? t.inst : null))).toEqual(['guitar', 'piano']);
    const l3 = buildScore('ABCD', 0, 3).tokens;
    expect(l3.map((t) => (t.kind === 'letter' ? t.inst : null))).toEqual(['piano', 'guitar', 'piano', 'guitar']);
    expect(() => buildScore('AB', 0, 5)).toThrow(/keyed voice/);
  });

  it('transposes bass down an octave (written stays on the stave)', () => {
    const t = buildScore('A', 0, 4, ['bass']).tokens[0]!;
    if (t.kind !== 'letter') throw new Error('expected letter');
    expect(t.written - t.sounding).toBe(12);
    expect(t.written).toBeGreaterThanOrEqual(60);
  });

  it('keeps structural tokens fixed and revealed', () => {
    const s = buildScore('GO, 2 WIN!', 0, 1);
    expect(s.tokens.map((t) => t.kind)).toEqual(['letter', 'letter', 'mark', 'space', 'digit', 'space', 'letter', 'letter', 'letter', 'mark']);
    const proj = projectScore(s, newGame(), { soundRef });
    expect(proj[2]).toMatchObject({ k: 'mark', ch: ',' });
    expect(proj[4]).toMatchObject({ k: 'digit', ch: '2' });
  });

  it('draws unbiased voices from random bytes', () => {
    const bytes = new Uint8Array(250_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const v = voicesFromBytes(bytes, 200_000);
    const counts = Object.fromEntries(INSTRUMENTS.map((x) => [x, v.filter((y) => y === x).length]));
    for (const c of Object.values(counts)) expect(c).toBe(40_000);
    expect(() => voicesFromBytes(new Uint8Array([255, 251]), 1)).toThrow(/entropy/);
  });
});

describe('message validation', () => {
  const dict = new Set(['KEEP', 'BUILDING', 'GET', 'THIS', 'DON', 'CAN', 'DOES', 'MUSIC', 'IS', 'CODE']);
  const isWord = (w: string) => dict.has(w);

  it('normalises without dropping anything', () => {
    expect(normaliseMessage('  café  “déjà” vu ')).toBe('CAFE “DEJA” VU');
    expect(normaliseMessage('don’t')).toBe("DON'T");
  });

  it('names unsupported characters instead of silently dropping them', () => {
    const r = validateMessage('HI 🎵 THERE', { wagered: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'unsupported_chars', chars: ['🎵'] });
  });

  it('requires real words for wagered challenges', () => {
    const bad = validateMessage('QXZJ VKWP', { wagered: true, isWord });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.map((e) => e.code)).toContain('not_words');
    const good = validateMessage('keep building', { wagered: true, isWord });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.shape).toEqual({ words: [4, 8], letters: 12 });
  });

  it('accepts contractions through their stem', () => {
    expect(dictionaryAccepts("DON'T", isWord)).toBe(true);
    expect(dictionaryAccepts("DOESN'T", isWord)).toBe(true);
    expect(dictionaryAccepts("ZZ'Q", isWord)).toBe(false);
  });

  it('enforces minimum letters and distinct letters when wagered', () => {
    const r = validateMessage('IS IS', { wagered: true, isWord });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['too_few_letters', 'too_few_distinct']));
  });
});

describe('game rules', () => {
  it('reveals every occurrence and solves when all letters are found', () => {
    let s = newGame();
    for (const l of 'GETHIS') {
      const r = applyGuess('GET THIS', 1, s, l);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.status).toBe('solved');
    expect(s.wrong).toBe(0);
  });

  it('makes brute force impossible: lives cap the misses', () => {
    for (const spec of LEVELS) {
      let s = newGame();
      for (const l of 'ZQXJKVBWYPFMGCULDRHSNIOATE') {
        if (s.status !== 'active') break;
        const r = applyGuess('KEEP BUILDING', spec.level, s, l);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      expect(s.status).toBe('failed');
      expect(s.wrong).toBe(spec.lives);
      expect(livesLeft(s, spec.level)).toBe(0);
    }
  });

  it('rejects repeat and invalid guesses and moves after the end', () => {
    const r = applyGuess('ABC', 1, newGame(), 'A');
    if (!r.ok) throw new Error();
    expect(applyGuess('ABC', 1, r.state, 'a')).toEqual({ ok: false, error: 'already_guessed' });
    expect(applyGuess('ABC', 1, r.state, '1')).toEqual({ ok: false, error: 'invalid_letter' });
    const done = { ...r.state, status: 'solved' as const };
    expect(applyGuess('ABC', 1, done, 'B')).toEqual({ ok: false, error: 'not_active' });
  });

  it('solves on the exact phrase (punctuation-insensitive) and penalises a wrong attempt', () => {
    const ok = applySolve("DON'T STOP!", 3, newGame(), 'dont stop');
    expect(ok.ok && ok.state.status).toBe('solved');
    const bad = applySolve("DON'T STOP!", 3, newGame(), 'dont shop');
    expect(bad.ok && bad.state.wrong).toBe(2);
    expect(bad.ok && bad.state.status).toBe('active');
  });
});

describe('information hiding', () => {
  const msg = 'MUSIC IS CODE';
  const voices = pianoKeyed(11);

  it('never sends unrevealed letters', () => {
    for (const spec of LEVELS) {
      const score = buildScore(msg, 7, spec.level, voices);
      const out = JSON.stringify(projectScore(score, newGame(), { soundRef: () => 'x' }));
      expect(out).not.toMatch(/"ch":"[A-Z]"/);
    }
  });

  it('hides instruments at Expert and pitches at Master until revealed', () => {
    const l5 = projectScore(buildScore(msg, 7, 5, voices), newGame(), { soundRef: () => 'x' });
    expect(l5.filter((t) => t.k === 'letter').every((t) => t.k === 'letter' && t.i === undefined && t.w !== undefined)).toBe(true);
    const l6 = projectScore(buildScore(msg, 7, 6, voices), newGame(), { soundRef: () => 'x' });
    expect(l6.filter((t) => t.k === 'letter').every((t) => t.k === 'letter' && t.i === undefined && t.w === undefined)).toBe(true);
    const revealed = projectScore(buildScore(msg, 7, 6, voices), { ...newGame(), revealed: 'S' }, { soundRef: () => 'x' });
    const s = revealed.find((t) => t.k === 'letter' && t.ch === 'S');
    expect(s).toMatchObject({ i: expect.any(String), w: expect.any(Number) });
  });

  it('shows instruments at levels 1–4', () => {
    for (const level of [1, 2, 3, 4] as Level[]) {
      const p = projectScore(buildScore(msg, 7, level, voices), newGame(), { soundRef: () => 'x' });
      expect(p.filter((t) => t.k === 'letter').every((t) => t.k === 'letter' && t.i !== undefined)).toBe(true);
    }
  });
});

describe('economy', () => {
  it('rounds rake down and never exceeds the amount', () => {
    expect(rakeOf(1, 500)).toBe(0);
    expect(rakeOf(20, 500)).toBe(1);
    expect(rakeOf(200, 500)).toBe(10);
    expect(() => rakeOf(-1)).toThrow();
  });

  it('routes guess fees to the coder, never back to the decoder', () => {
    const t = feeTransfers(5, true, 'dec', 'cod', CHIPS.defaultRakeBps);
    expect(t).toEqual([{ from: { kind: 'user', userId: 'dec' }, to: { kind: 'user', userId: 'cod' }, amount: 3, kind: 'guess_fee' }]);
    expect(feeTransfers(5, false, 'dec', 'cod', 500)).toEqual([]);
  });

  it('settles the escrow to the right party and conserves chips', () => {
    const solved = settlementTransfers('solved', 'c1', 100, 'cod', 'dec', 500);
    expect(solved.reduce((a, t) => a + t.amount, 0)).toBe(100);
    expect(solved[0]).toMatchObject({ to: { kind: 'user', userId: 'dec' }, amount: 95 });
    for (const r of ['failed', 'forfeited', 'expired', 'withdrawn'] as const) {
      expect(settlementTransfers(r, 'c1', 100, 'cod', null, 500)).toEqual([
        { from: { kind: 'escrow', challengeId: 'c1' }, to: { kind: 'user', userId: 'cod' }, amount: 100, kind: 'refund' },
      ]);
    }
  });

  it('checks pots against the level range', () => {
    expect(checkPot(1, 0)).toEqual({ ok: true });
    expect(checkPot(1, 6)).toMatchObject({ ok: false, reason: 'above_max' });
    expect(checkPot(6, 14)).toMatchObject({ ok: false, reason: 'below_min' });
    expect(checkPot(6, 300, 2)).toEqual({ ok: true });
    expect(checkPot(3, 2.5)).toMatchObject({ ok: false, reason: 'not_integer' });
  });
});

describe('ratings', () => {
  it('moves decoder and coder in opposite directions', () => {
    const r = rateChallenge({ decoderRating: 1200, decoderGames: 0, coderRating: 1200, coderGames: 0, level: 3, solved: true });
    expect(r.expected).toBeCloseTo(0.5);
    expect(r.decoderDelta).toBe(20);
    expect(r.coderDelta).toBe(-20);
  });

  it('rewards solving harder levels more', () => {
    const easy = rateChallenge({ decoderRating: 1200, decoderGames: 30, coderRating: 1200, coderGames: 30, level: 1, solved: true });
    const hard = rateChallenge({ decoderRating: 1200, decoderGames: 30, coderRating: 1200, coderGames: 30, level: 6, solved: true });
    expect(hard.decoderDelta).toBeGreaterThan(easy.decoderDelta);
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
  });

  it('maps ratings to named tiers', () => {
    expect(tierFor(900).name).toBe('Novice');
    expect(tierFor(1300).name).toBe('Decoder');
    expect(tierFor(2500).name).toBe('Grand Cipher');
  });
});

describe('motif codebook', () => {
  it('proves the v1 defects', () => {
    const c = motifCollisions(MOTIFS_V1);
    expect(c.map((x) => x.clusters.sort().join('='))).toEqual(expect.arrayContaining(['ed=g', 'er=h']));
    expect(motifPrefixPairs(MOTIFS_V1).length).toBeGreaterThan(0);
    expect(isUniquelyDecodable(MOTIFS_V1)).toBe(false);
  });

  it('v2 is uniquely decodable and keeps the 130 + 2 structure', () => {
    expect(motifCollisions(MOTIFS_V2)).toEqual([]);
    expect(isUniquelyDecodable(MOTIFS_V2)).toBe(true);
    expect(motifCount(MOTIFS_V2)).toEqual({ core: 130, rare: 2 });
  });
});

describe('samples & stave', () => {
  it('covers every sound any level can request', () => {
    const have = new Set(requiredSamples().map((s) => sampleKey(s.inst, s.midi)));
    for (const spec of LEVELS) {
      for (let k = 0; k < 12; k++) {
        const score = buildScore("THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG, 0123456789 .?!'-", k, spec.level, Array.from({ length: 40 }, (_, i) => INSTRUMENTS[(i * 7 + k) % 5]!));
        for (const t of score.tokens) if (t.kind !== 'space') expect(have.has(sampleKey(t.inst, t.sounding))).toBe(true);
      }
    }
  });

  it('places notes on the treble stave with ledger lines', () => {
    expect(noteName(60)).toBe('C4');
    expect(placeOnTreble(64)).toMatchObject({ step: 0, ledgers: [], stemUp: true });
    expect(placeOnTreble(60)).toMatchObject({ step: -2, ledgers: [-2] });
    expect(placeOnTreble(81)).toMatchObject({ step: 10, ledgers: [10], stemUp: false });
    expect(placeOnTreble(61).sharp).toBe(true);
  });
});
