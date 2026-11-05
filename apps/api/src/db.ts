import type { AccountRef, Transfer } from '@gt/engine';

export const now = (): number => Date.now();

export function accountId(ref: AccountRef): string {
  switch (ref.kind) {
    case 'user':
      return `user:${ref.userId}`;
    case 'escrow':
      return `escrow:${ref.challengeId}`;
    case 'house':
      return 'house';
    case 'mint':
      return 'mint';
  }
}

/**
 * Statements for a set of transfers sharing one transaction id.
 * Run inside DB.batch(): an overdraft violates the balance CHECK and rolls the
 * whole batch back, so a failed debit can never leave a half-applied action.
 */
export function transferStatements(db: D1Database, txId: string, transfers: Transfer[], challengeId: string | null, at: number): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const t of transfers) {
    if (t.amount <= 0) continue;
    const from = accountId(t.from);
    const to = accountId(t.to);
    out.push(
      db.prepare('UPDATE accounts SET balance = balance - ?1 WHERE id = ?2').bind(t.amount, from),
      db.prepare('UPDATE accounts SET balance = balance + ?1 WHERE id = ?2').bind(t.amount, to),
      db
        .prepare('INSERT INTO ledger (tx_id, account_id, delta, kind, challenge_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6), (?1, ?7, ?8, ?4, ?5, ?6)')
        .bind(txId, from, -t.amount, t.kind, challengeId, at, to, t.amount),
    );
  }
  return out;
}

export type BatchFailure = 'conflict' | 'insufficient_chips' | 'duplicate' | 'unknown';

/** Classify a D1 batch error. SQLite constraint text is stable across D1 versions. */
export function classifyBatchError(err: unknown): BatchFailure {
  const msg = String((err as Error)?.message ?? err);
  if (/CHECK constraint failed/i.test(msg)) return 'insufficient_chips';
  if (/UNIQUE constraint failed: challenge_events/i.test(msg) || /PRIMARY KEY.*challenge_events|challenge_events\.challenge_id, challenge_events\.seq/i.test(msg)) return 'conflict';
  if (/UNIQUE constraint failed/i.test(msg)) return 'duplicate';
  return 'unknown';
}

export async function balanceOf(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare('SELECT balance FROM accounts WHERE id = ?1').bind(`user:${userId}`).first<{ balance: number }>();
  return row?.balance ?? 0;
}
