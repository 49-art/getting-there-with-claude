import { levelSpec, type Level } from './constants.ts';

/**
 * Elo-style skill ratings. A wagered challenge is a match between the
 * decoder and the challenge, whose strength = coder rating + level offset.
 * Decoder and coder ratings move in opposite directions.
 */

export const RATING = {
  start: 1200,
  floor: 100,
  provisionalGames: 15,
  kProvisional: 40,
  kEstablished: 24,
} as const;

export interface Tier {
  name: string;
  min: number;
  colour: string;
}

export const TIERS: readonly Tier[] = [
  { name: 'Novice', min: 0, colour: '#8A8AA6' },
  { name: 'Reader', min: 1000, colour: '#38E08A' },
  { name: 'Decoder', min: 1300, colour: '#00E5FF' },
  { name: 'Cipher Hunter', min: 1600, colour: '#F5C542' },
  { name: 'Master Ear', min: 1900, colour: '#A06BFF' },
  { name: 'Grand Cipher', min: 2200, colour: '#FF2E88' },
];

export function tierFor(rating: number): Tier {
  let t = TIERS[0]!;
  for (const tier of TIERS) if (rating >= tier.min) t = tier;
  return t;
}

export function expectedScore(decoderRating: number, challengeStrength: number): number {
  return 1 / (1 + 10 ** ((challengeStrength - decoderRating) / 400));
}

export function kFactor(games: number): number {
  return games < RATING.provisionalGames ? RATING.kProvisional : RATING.kEstablished;
}

export interface RatingUpdate {
  decoderDelta: number;
  coderDelta: number;
  expected: number;
}

export function rateChallenge(input: {
  decoderRating: number;
  decoderGames: number;
  coderRating: number;
  coderGames: number;
  level: Level;
  solved: boolean;
}): RatingUpdate {
  const strength = input.coderRating + levelSpec(input.level).ratingOffset;
  const expected = expectedScore(input.decoderRating, strength);
  const s = input.solved ? 1 : 0;
  const decoderDelta = Math.round(kFactor(input.decoderGames) * (s - expected));
  const coderDelta = Math.round(kFactor(input.coderGames) * (expected - s));
  return { decoderDelta, coderDelta, expected };
}

export const applyDelta = (rating: number, delta: number): number => Math.max(RATING.floor, rating + delta);
