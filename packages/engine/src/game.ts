import { levelSpec, type Instrument, type Level, type Punctuation } from './constants.ts';
import { canonicalPhrase, lettersOf } from './message.ts';
import type { Score } from './score.ts';

export type GameStatus = 'active' | 'solved' | 'failed';

export interface GameState {
  /** Letters guessed correctly, sorted A–Z. */
  revealed: string;
  /** Letters guessed wrongly, in guess order. */
  missed: string;
  /** Wrong-guess count, including the 2-life penalty for a wrong solve. */
  wrong: number;
  /** Paid actions taken (letter guesses + solve attempts). */
  actions: number;
  status: GameStatus;
}

export const newGame = (): GameState => ({ revealed: '', missed: '', wrong: 0, actions: 0, status: 'active' });

export type MoveError = 'not_active' | 'invalid_letter' | 'already_guessed' | 'empty_attempt';

export type MoveResult =
  | { ok: true; state: GameState; hit: boolean; occurrences: number }
  | { ok: false; error: MoveError };

/** A wrong full-phrase attempt costs this many lives. */
export const WRONG_SOLVE_PENALTY = 2;

const sortLetters = (s: string) => [...s].sort().join('');

export function livesLeft(state: GameState, level: Level, lives: number = levelSpec(level).lives): number {
  return Math.max(0, lives - state.wrong);
}

export function allRevealed(message: string, revealed: string): boolean {
  const have = new Set(revealed);
  return [...new Set(lettersOf(message))].every((c) => have.has(c));
}

/** Guess one letter. Pure: returns the next state, never mutates. */
export function applyGuess(message: string, level: Level, state: GameState, rawLetter: string, lives: number = levelSpec(level).lives): MoveResult {
  if (state.status !== 'active') return { ok: false, error: 'not_active' };
  const letter = rawLetter.toUpperCase();
  if (!/^[A-Z]$/.test(letter)) return { ok: false, error: 'invalid_letter' };
  if (state.revealed.includes(letter) || state.missed.includes(letter)) return { ok: false, error: 'already_guessed' };

  const occurrences = [...lettersOf(message)].filter((c) => c === letter).length;
  const hit = occurrences > 0;
  const next: GameState = {
    revealed: hit ? sortLetters(state.revealed + letter) : state.revealed,
    missed: hit ? state.missed : state.missed + letter,
    wrong: hit ? state.wrong : state.wrong + 1,
    actions: state.actions + 1,
    status: 'active',
  };
  if (hit && allRevealed(message, next.revealed)) next.status = 'solved';
  else if (!hit && next.wrong >= lives) next.status = 'failed';
  return { ok: true, state: next, hit, occurrences };
}

/** Attempt the whole phrase. Right = solved; wrong = lose WRONG_SOLVE_PENALTY lives. */
export function applySolve(message: string, level: Level, state: GameState, attempt: string, lives: number = levelSpec(level).lives): MoveResult {
  if (state.status !== 'active') return { ok: false, error: 'not_active' };
  const guess = canonicalPhrase(attempt);
  if (!guess) return { ok: false, error: 'empty_attempt' };
  const correct = guess === canonicalPhrase(message);
  if (correct) {
    return {
      ok: true,
      hit: true,
      occurrences: 0,
      state: { ...state, revealed: sortLetters([...new Set(lettersOf(message))].join('')), actions: state.actions + 1, status: 'solved' },
    };
  }
  const wrong = Math.min(lives, state.wrong + WRONG_SOLVE_PENALTY);
  return {
    ok: true,
    hit: false,
    occurrences: 0,
    state: { ...state, wrong, actions: state.actions + 1, status: wrong >= lives ? 'failed' : 'active' },
  };
}

/* ------------------------------------------------------------------ */
/* Public projection — what a decoder's device is allowed to know.     */
/* ------------------------------------------------------------------ */

export type PublicToken =
  | { k: 'space' }
  | { k: 'mark'; ch: Punctuation; w: number; i: 'violin'; s: string }
  | { k: 'digit'; ch: string; w: number; i: 'synth'; s: string }
  | {
      k: 'letter';
      /** Letter position among letters. */
      p: number;
      /** Written pitch — omitted when the level has no stave. */
      w?: number;
      /** Instrument — omitted while hidden by the level. */
      i?: Instrument;
      /** Revealed character. */
      ch?: string;
      /** Sound reference (opaque token or local sample key). */
      s: string;
    };

export interface ProjectOptions {
  /** Map an (instrument, sounding pitch) to a sound reference string. */
  soundRef: (inst: Instrument, sounding: number, index: number) => string;
  /** Reveal everything (resolved challenge, or the coder's own view). */
  full?: boolean;
}

export function projectScore(score: Score, state: GameState, opts: ProjectOptions): PublicToken[] {
  const aids = levelSpec(score.level).aids;
  const revealed = new Set(state.revealed);
  return score.tokens.map((t): PublicToken => {
    switch (t.kind) {
      case 'space':
        return { k: 'space' };
      case 'mark':
        return { k: 'mark', ch: t.char, w: t.written, i: 'violin', s: opts.soundRef(t.inst, t.sounding, t.index) };
      case 'digit':
        return { k: 'digit', ch: t.char, w: t.written, i: 'synth', s: opts.soundRef(t.inst, t.sounding, t.index) };
      case 'letter': {
        const open = opts.full || revealed.has(t.char);
        const out: PublicToken = { k: 'letter', p: t.letterPos, s: opts.soundRef(t.inst, t.sounding, t.index) };
        // Revealed letters keep their pitch even at audio-only level: they are the decoder's anchors.
        if (aids.staff || open) out.w = t.written;
        if (!aids.instrumentHidden || open) out.i = t.inst;
        if (open) out.ch = t.char;
        return out;
      }
    }
  });
}
