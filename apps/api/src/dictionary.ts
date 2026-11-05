import { WORDS } from './generated/words.ts';

/**
 * Binary search over one sorted, newline-joined string: no array or Set is
 * built at start-up, so the 79k-word list costs nothing until it is used.
 */
export function isWord(word: string): boolean {
  let lo = 0;
  let hi = WORDS.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const start = WORDS.lastIndexOf('\n', mid - 1) + 1;
    let end = WORDS.indexOf('\n', start);
    if (end === -1) end = WORDS.length;
    const candidate = WORDS.slice(start, end);
    if (candidate === word) return true;
    if (candidate < word) lo = end + 1;
    else hi = start;
  }
  return false;
}
