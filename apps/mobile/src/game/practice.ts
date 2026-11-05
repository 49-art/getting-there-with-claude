import {
  INSTRUMENTS,
  KEY_COUNT,
  applyGuess,
  applySolve,
  buildScore,
  letterCount,
  levelSpec,
  newGame,
  normaliseMessage,
  projectScore,
  sampleKey,
  type GameState,
  type Instrument,
  type Level,
} from '@gt/engine';
import { useCallback, useMemo, useState } from 'react';
import type { BoardModel } from '../components/GameBoard';

/** The original prototype's transmissions, kept as practice pieces. */
export const SAMPLES: readonly { text: string; level: Level }[] = [
  { text: 'GETTING THERE', level: 1 },
  { text: 'GET THIS.', level: 1 },
  { text: 'KEEP BUILDING', level: 2 },
  { text: 'DIGNITY FIRST', level: 2 },
  { text: 'MUSIC IS CODE', level: 3 },
  { text: 'HELLO WORLD!', level: 4 },
];

const rand = (n: number) => Math.floor(Math.random() * n);

/** Offline game against the engine — same rules as live play, no chips. */
export function usePractice(text: string, level: Level) {
  const message = normaliseMessage(text);
  const [round, setRound] = useState(0);
  const setup = useMemo(() => {
    const key = rand(KEY_COUNT);
    const voices: Instrument[] | undefined = levelSpec(level).voices === 'keyed-five' ? Array.from({ length: letterCount(message) }, () => INSTRUMENTS[rand(5)]!) : undefined;
    return { key, score: buildScore(message, key, level, voices), round };
    // A new key (and voices) for every piece, level or replay.
  }, [message, level, round]);
  const [state, setState] = useState<GameState>(newGame);
  const [forfeited, setForfeited] = useState(false);
  const spec = levelSpec(level);
  const done = state.status !== 'active' || forfeited;

  const tokens = useMemo(
    () => projectScore(setup.score, state, { full: done, soundRef: (inst, midi) => sampleKey(inst, midi) }),
    [setup.score, state, done],
  );

  const model: BoardModel = {
    level,
    levelName: spec.name,
    aids: spec.aids,
    tempo: spec.tempo,
    tokens,
    revealed: state.revealed,
    missed: state.missed,
    wrong: state.wrong,
    lives: spec.lives,
    status: forfeited ? 'forfeited' : state.status,
    guessCost: 0,
    pot: 0,
    message: done ? message : null,
    canPlay: !done,
    actions: state.actions,
  };

  const guess = useCallback(
    (l: string) => {
      const r = applyGuess(message, level, state, l);
      if (!r.ok) return undefined;
      setState(r.state);
      return r.hit;
    },
    [message, level, state],
  );
  const solve = useCallback(
    (a: string) => {
      const r = applySolve(message, level, state, a);
      if (!r.ok) return undefined;
      setState(r.state);
      return r.hit;
    },
    [message, level, state],
  );
  const reset = useCallback(() => {
    setState(newGame());
    setForfeited(false);
    setRound((r) => r + 1);
  }, []);
  return { model, guess, solve, forfeit: () => setForfeited(true), reset, key: setup.key };
}
