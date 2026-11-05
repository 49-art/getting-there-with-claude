import { CHIPS, levelSpec, type Level } from './constants.ts';

/**
 * Chip economy rules. All amounts are integer chips; all transfers are
 * double-entry (every transfer has a debit account and a credit account).
 *
 * Settlement model (fixes the "decoder can never lose" flaw):
 *  - Coder escrows the pot when posting.
 *  - Every paid action (letter guess or solve attempt) costs the decoder
 *    `guessCost`; the fee goes to the coder immediately and is never refunded.
 *  - Decoder solves  → escrowed pot goes to the decoder (minus house rake).
 *  - Decoder fails / forfeits / times out → pot returns to the coder.
 *  - Lives cap wrong guesses, so brute force (guessing all 26 letters) is
 *    impossible: at most `lives` misses are allowed.
 */

export type AccountRef = { kind: 'user'; userId: string } | { kind: 'escrow'; challengeId: string } | { kind: 'house' } | { kind: 'mint' };

export type TransferKind = 'starter_grant' | 'daily_grant' | 'escrow_lock' | 'guess_fee' | 'rake' | 'payout' | 'refund' | 'admin_grant';

export interface Transfer {
  from: AccountRef;
  to: AccountRef;
  amount: number;
  kind: TransferKind;
}

export function rakeOf(amount: number, rakeBps: number = CHIPS.defaultRakeBps): number {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('amount must be a non-negative integer');
  return Math.floor((amount * rakeBps) / 10_000);
}

export const user = (userId: string): AccountRef => ({ kind: 'user', userId });
export const escrow = (challengeId: string): AccountRef => ({ kind: 'escrow', challengeId });
export const HOUSE: AccountRef = { kind: 'house' };
export const MINT: AccountRef = { kind: 'mint' };

export function guessCostFor(level: Level, wagered: boolean): number {
  return wagered ? levelSpec(level).guessCost : 0;
}

export type PotCheck = { ok: true } | { ok: false; reason: 'below_min' | 'above_max' | 'not_integer'; min: number; max: number };

export function checkPot(level: Level, pot: number, maxMultiplier = 1): PotCheck {
  const spec = levelSpec(level);
  const max = Math.floor(spec.potMax * maxMultiplier);
  if (!Number.isInteger(pot)) return { ok: false, reason: 'not_integer', min: spec.potMin, max };
  if (pot === 0) return { ok: true }; // friendly, unwagered
  if (pot < spec.potMin) return { ok: false, reason: 'below_min', min: spec.potMin, max };
  if (pot > max) return { ok: false, reason: 'above_max', min: spec.potMin, max };
  return { ok: true };
}

/** Fee transfers for one paid action. */
export function feeTransfers(level: Level, wagered: boolean, decoderId: string, coderId: string, rakeBps: number): Transfer[] {
  const cost = guessCostFor(level, wagered);
  if (cost === 0) return [];
  const rake = rakeOf(cost, rakeBps);
  const out: Transfer[] = [{ from: user(decoderId), to: user(coderId), amount: cost - rake, kind: 'guess_fee' }];
  if (rake > 0) out.push({ from: user(decoderId), to: HOUSE, amount: rake, kind: 'rake' });
  return out;
}

export type Resolution = 'solved' | 'failed' | 'forfeited' | 'expired' | 'withdrawn';

/** Transfers that empty a challenge's escrow when it resolves. */
export function settlementTransfers(
  resolution: Resolution,
  challengeId: string,
  pot: number,
  coderId: string,
  decoderId: string | null,
  rakeBps: number,
): Transfer[] {
  if (pot === 0) return [];
  if (resolution === 'solved') {
    if (!decoderId) throw new Error('solved challenge needs a decoder');
    const rake = rakeOf(pot, rakeBps);
    const out: Transfer[] = [{ from: escrow(challengeId), to: user(decoderId), amount: pot - rake, kind: 'payout' }];
    if (rake > 0) out.push({ from: escrow(challengeId), to: HOUSE, amount: rake, kind: 'rake' });
    return out;
  }
  return [{ from: escrow(challengeId), to: user(coderId), amount: pot, kind: 'refund' }];
}

/**
 * Break-even pots from the calibration in docs/ECONOMY.md (npm run simulate):
 * the pot at which a decoder of that strength breaks even
 * (pot × P(win) = expected fees). Shown to coders when they price a pot.
 */
export const BREAK_EVEN_POT: Record<Level, { wordSolver: number; staveReader: number }> = {
  1: { wordSolver: 10, staveReader: 3 },
  2: { wordSolver: 10, staveReader: 3 },
  3: { wordSolver: 21, staveReader: 6 },
  4: { wordSolver: 21, staveReader: 6 },
  5: { wordSolver: 32, staveReader: 24 },
  6: { wordSolver: 33, staveReader: 31 },
};

/** Per-tier multiplier on a level's maximum pot. */
export const POT_MULTIPLIER = { free: 1, coder: 1, host: 1.5, studio: 2 } as const;
