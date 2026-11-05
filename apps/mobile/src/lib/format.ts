export function ago(ms: number, at = Date.now()): string {
  const s = Math.max(0, Math.round((at - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function waited(ms: number, at = Date.now()): string {
  const m = Math.max(0, Math.floor((at - ms) / 60000));
  if (m < 1) return 'Waiting < 1m';
  if (m < 60) return `Waiting ${m}m`;
  const h = Math.floor(m / 60);
  return `Waiting ${h}h ${m % 60}m`;
}

export const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
export const chips = (n: number) => `${n} chip${n === 1 ? '' : 's'}`;

export const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  active: 'In play',
  solved: 'Solved',
  failed: 'Failed',
  forfeited: 'Given up',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};
