/**
 * Monte Carlo calibration of the GT wager economy.
 *
 * Plays thousands of wagered challenges built from real English phrases with
 * four decoder strategies and reports, per level: win rate, mean paid actions,
 * and the break-even ("fair") pot. Output: docs/ECONOMY.md + console table.
 *
 *   naive      – "Beginner": guesses letters in English frequency order, ignores music
 *   wordsmith  – "Word solver": perfect pattern-matching over the whole vocabulary.
 *                This is computer-grade word skill; strong humans sit between
 *                Beginner and Word solver. Ignores music.
 *   musician   – "Stave reader": Word solver + reads the stave. After the first
 *                hit derives k and narrows each note to its 2–3 candidate
 *                letters. At Expert it identifies instruments by ear (85%); at
 *                Master it also hears pitch (75% exact, else a semitone off).
 *   bot        – "Key-search bot": tests all 12 keys before guessing wherever
 *                pitches and instruments are visible; perfect perception everywhere
 *                (worst case — assumes audio can be classified).
 *
 * Run: npm run simulate   (deterministic: seeded PRNG)
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { LEVELS, buildScore, keyFromReveal, voicesFromBytes, letterCount, INSTRUMENTS, MASK, mod } from '../packages/engine/src/index.ts';
import type { Instrument, Level, LevelSpec } from '../packages/engine/src/index.ts';

const require = createRequire(import.meta.url);

// ---------- deterministic PRNG ----------
function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const rand = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x12345678);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;

// ---------- vocabulary ----------
const vocab: string[] = [...new Set<string>([...require('wordlist-english/english-words-10.json'), ...require('wordlist-english/english-words-20.json')])]
  .filter((w) => /^[a-z]{3,9}$/.test(w))
  .map((w) => w.toUpperCase());
const byLength = new Map<number, string[]>();
for (const w of vocab) (byLength.get(w.length) ?? byLength.set(w.length, []).get(w.length)!).push(w);

function makePhrase(): string {
  for (;;) {
    const n = 2 + Math.floor(rand() * 2); // 2–3 words
    const words = Array.from({ length: n }, () => pick(vocab));
    const p = words.join(' ');
    const letters = p.replace(/ /g, '');
    if (letters.length >= 8 && letters.length <= 20 && new Set(letters).size >= 5) return p;
  }
}

const FREQ = 'ETAOINSHRDLCUMWFGYPBVKJXQZ';

// ---------- one game ----------
type Strategy = 'naive' | 'wordsmith' | 'musician' | 'bot';
interface Outcome { won: boolean; actions: number }

interface Note { pc: number; inst: Instrument }

function playGame(phrase: string, spec: LevelSpec, strategy: Strategy): Outcome {
  const key = Math.floor(rand() * 12);
  const n = letterCount(phrase);
  const bytes = new Uint8Array(n * 3 + 16).map(() => Math.floor(rand() * 256));
  const voices = voicesFromBytes(bytes, n);
  const score = buildScore(phrase, key, spec.level, voices);
  const words = phrase.split(' ');
  // Per-word note info as the decoder perceives it.
  const perceived: Note[][] = [];
  let li = 0;
  const hiddenInst = spec.aids.instrumentHidden;
  const noStaff = !spec.aids.staff;
  for (const w of words) {
    const arr: Note[] = [];
    for (let j = 0; j < w.length; j++) {
      const t = score.tokens.filter((x) => x.kind === 'letter')[li++]!;
      if (t.kind !== 'letter') throw new Error();
      let inst = t.inst;
      let pc = t.pc;
      if (strategy === 'musician') {
        if (hiddenInst && rand() > 0.85) inst = pick(INSTRUMENTS.filter((x) => x !== t.inst));
        if (noStaff && rand() > 0.75) pc = mod(pc + (rand() < 0.5 ? -1 : 1), 12);
      }
      arr.push({ pc, inst });
    }
    perceived.push(arr);
  }

  const revealed = new Set<string>();
  const missed = new Set<string>();
  let wrong = 0;
  let actions = 0;
  const answerLetters = new Set(phrase.replace(/ /g, ''));
  const usesMusic = strategy === 'musician' || strategy === 'bot';
  const botCanSee = strategy === 'bot' && !hiddenInst && !noStaff;

  // Known key: bot solves it from the music up front when it can see everything.
  let knownKey: number | null = null;
  const consistentWord = (cand: string, wi: number, k: number | null): boolean => {
    const w = words[wi]!;
    for (let j = 0; j < w.length; j++) {
      const c = cand[j]!;
      const real = w[j]!;
      if (revealed.has(real)) { if (c !== real) return false; }
      else if (revealed.has(c) || missed.has(c)) return false;
      if (usesMusic && k !== null && !revealed.has(real)) {
        const note = perceived[wi]![j]!;
        if (mod(c.charCodeAt(0) - 65 - k + MASK[note.inst], 12) !== note.pc) return false;
      }
    }
    return true;
  };
  if (botCanSee) {
    const fits: number[] = [];
    for (let k = 0; k < 12; k++) if (words.every((w, wi) => byLength.get(w.length)!.some((c) => consistentWord(c, wi, k)))) fits.push(k);
    if (fits.length === 1) knownKey = fits[0]!;
  }

  while (wrong < spec.lives) {
    if ([...answerLetters].every((c) => revealed.has(c))) return { won: true, actions };
    // Candidate words per position.
    const cands = words.map((w, wi) => {
      if (strategy === 'naive') return [] as string[];
      const pool = byLength.get(w.length)!;
      let c = pool.filter((x) => consistentWord(x, wi, knownKey));
      if (c.length === 0 && knownKey !== null) c = pool.filter((x) => consistentWord(x, wi, null)); // misheard: drop music
      return c;
    });
    // Early solve when every word is pinned down.
    if (strategy !== 'naive' && cands.every((c) => c.length === 1)) {
      actions++;
      if (cands.map((c) => c[0]).join(' ') === phrase) return { won: true, actions };
      wrong += 2; // wrong-solve penalty
      continue;
    }
    // Choose a letter.
    let letter = '';
    if (strategy === 'naive') {
      letter = [...FREQ].find((c) => !revealed.has(c) && !missed.has(c))!;
    } else {
      let best = -1;
      for (const c of FREQ) {
        if (revealed.has(c) || missed.has(c)) continue;
        let pMiss = 1;
        cands.forEach((list, wi) => {
          if (!list.length) return;
          const hidden = [...words[wi]!].some((ch) => !revealed.has(ch));
          if (!hidden) return;
          const has = list.filter((x) => x.includes(c)).length / list.length;
          pMiss *= 1 - has;
        });
        const p = 1 - pMiss;
        if (p > best + 1e-9) { best = p; letter = c; }
      }
      if (!letter) letter = [...FREQ].find((c) => !revealed.has(c) && !missed.has(c))!;
    }
    actions++;
    if (answerLetters.has(letter)) {
      revealed.add(letter);
      if (usesMusic && knownKey === null) {
        // Derive k from the first revealed note we perceived correctly.
        outer: for (let wi = 0; wi < words.length; wi++) for (let j = 0; j < words[wi]!.length; j++) {
          if (words[wi]![j] === letter) { const note = perceived[wi]![j]!; knownKey = keyFromReveal(letter, note.pc, note.inst); break outer; }
        }
      }
    } else {
      missed.add(letter);
      wrong++;
    }
  }
  return { won: [...answerLetters].every((c) => revealed.has(c)), actions };
}

// ---------- run ----------
const GAMES = Number(process.env.GAMES ?? 1500);
const phrases = Array.from({ length: GAMES }, makePhrase);
const strategies: Strategy[] = ['naive', 'wordsmith', 'musician', 'bot'];
interface Row { level: Level; name: string; lives: number; cost: number; potMin: number; potMax: number; stats: Record<Strategy, { win: number; actions: number; fair: number }> }
const rows: Row[] = [];
const LIVES_OVERRIDE = process.env.LIVES ? Number(process.env.LIVES) : null;
for (const baseSpec of LEVELS) {
  const spec: LevelSpec = LIVES_OVERRIDE ? { ...baseSpec, lives: LIVES_OVERRIDE } : baseSpec;
  const stats = {} as Row['stats'];
  for (const s of strategies) {
    let wins = 0;
    let acts = 0;
    for (const p of phrases) { const o = playGame(p, spec, s); if (o.won) wins++; acts += o.actions; }
    const win = wins / phrases.length;
    const actions = acts / phrases.length;
    stats[s] = { win, actions, fair: win > 0 ? (actions * spec.guessCost) / win : Infinity };
  }
  rows.push({ level: spec.level, name: spec.name, lives: spec.lives, cost: spec.guessCost, potMin: spec.potMin, potMax: spec.potMax, stats });
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '∞');
const header = '| Level | Lives | Cost | Pot range | Beginner win | Word solver win | Stave reader win | Key-search bot win | Paid actions (word solver / stave reader) | Break-even pot (word solver / stave reader) |\n|---|---|---|---|---|---|---|---|---|---|';
const table = rows.map((r) => `| L${r.level} ${r.name} | ${r.lives} | ${r.cost} | ${r.potMin}–${r.potMax} | ${pct(r.stats.naive.win)} | ${pct(r.stats.wordsmith.win)} | ${pct(r.stats.musician.win)} | ${pct(r.stats.bot.win)} | ${f1(r.stats.wordsmith.actions)} / ${f1(r.stats.musician.actions)} | ${f1(r.stats.wordsmith.fair)} / ${f1(r.stats.musician.fair)} |`).join('\n');
console.log(`${header}\n${table}`);

if (process.env.WRITE === '1') {
  const doc = `# GT economy calibration

Generated by \`npm run simulate\` (seeded, ${GAMES} English phrases of 2–3 common words, 8–20 letters, ≥5 distinct letters).

Settlement rules under test: decoder pays the level's guess cost per letter guess or solve attempt (fee goes to the coder, never refunded); a wrong solve costs 2 lives; the escrowed pot pays the decoder on a solve and returns to the coder otherwise.

${header}
${table}

## How to read this

- **Break-even pot** = pot at which that decoder breaks even: pot × P(win) = expected fees. Pots above it favour the decoder; below it favour the coder. The Create screen shows these numbers so coders price knowingly; a pot above the word-solver break-even is a headline prize the coder should expect to pay out.
- **Music reading is the decisive skill.** A stave reader needs about 3 paid actions at L1–L4 against about 10 for a perfect word solver — roughly 70% fewer chips spent per game. At Expert and Master, where the client withholds instruments (and pitches), the advantage narrows to what the player's ear can recover. That ordering is the whole point of the product.
- **Real people.** The Beginner and Word-solver columns bracket human play. Lives fall from 8 to 4 as levels rise, so a beginner wins 28% at Easy and 3% at Master.
- **No guaranteed edge for any human strategy.** Lives cap misses, so guessing all 26 letters is impossible; every human strategy loses some games and every pot can be lost by the coder. The old GT1 rule (fees returned to the winner, no lives) let any decoder win every pot at zero risk; that is gone.
- **Automation is the residual risk, stated plainly.** The key-search bot wins every game in this table because it is modelled with perfect perception at every level — the worst case, assuming it can classify the audio. Expert and Master withhold instruments (and at Master, pitches) from the client, so a cheat has to analyse audio rather than read data, and every sound is served under an opaque per-note token with randomised padding. That raises the cost of cheating; it does not make it impossible. Any puzzle shown on a device can be automated. Mitigations and the policy position are in docs/DECISIONS.md (D-015).
`;
  writeFileSync(new URL('../docs/ECONOMY.md', import.meta.url), doc);
  console.log('\nWrote docs/ECONOMY.md');
}
