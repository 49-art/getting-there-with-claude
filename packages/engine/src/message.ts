import { MESSAGE_LIMITS, PUNCTUATION } from './constants.ts';

const ALLOWED = /^[A-Z0-9 ,.?!'\-]$/;

/**
 * Normalise user text into the GT alphabet.
 * - Unicode compatibility fold, diacritics stripped (É → E)
 * - Curly quotes and dashes mapped to ' and -
 * - Uppercase, whitespace collapsed, trimmed
 * Nothing is silently dropped: unsupported characters survive normalisation
 * so validation can name them.
 */
export function normaliseMessage(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MessageShape {
  /** Letters per word, in order (what hangman shows anyway). */
  words: number[];
  letters: number;
}

export type ValidationError =
  | { code: 'empty' }
  | { code: 'too_long'; max: number }
  | { code: 'unsupported_chars'; chars: string[] }
  | { code: 'too_few_letters'; min: number }
  | { code: 'too_few_distinct'; min: number }
  | { code: 'not_words'; words: string[] };

export type ValidationResult =
  | { ok: true; message: string; shape: MessageShape; distinct: number }
  | { ok: false; errors: ValidationError[] };

export interface ValidateOptions {
  /** Wagered challenges must be fair: real words, enough letters. */
  wagered: boolean;
  /** Dictionary lookup (uppercase word, apostrophes kept). Required when wagered. */
  isWord?: (word: string) => boolean;
}

export function lettersOf(message: string): string {
  return message.replace(/[^A-Z]/g, '');
}

export function shapeOf(message: string): MessageShape {
  const words = message
    .split(' ')
    .map((w) => lettersOf(w).length)
    .filter((n) => n > 0);
  return { words, letters: words.reduce((a, b) => a + b, 0) };
}

/** Split into dictionary words: letters and apostrophes only, digits ignored. */
export function wordsOf(message: string): string[] {
  return message
    .split(/[ ,.?!\-0-9]+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => /[A-Z]/.test(w));
}

const CONTRACTION_SUFFIX = new Set(['S', 'T', 'D', 'LL', 'RE', 'VE', 'M']);

/** True when the word (or its contraction stem) is in the dictionary. */
export function dictionaryAccepts(word: string, isWord: (w: string) => boolean): boolean {
  if (isWord(word)) return true;
  if (!word.includes("'")) return false;
  if (isWord(word.replace(/'/g, ''))) return true;
  const [stem, suffix, ...rest] = word.split("'");
  if (rest.length > 0 || !stem || !suffix) return false;
  return CONTRACTION_SUFFIX.has(suffix) && (isWord(stem) || (stem.endsWith('N') && isWord(stem.slice(0, -1))));
}

export function validateMessage(raw: string, opts: ValidateOptions): ValidationResult {
  const message = normaliseMessage(raw);
  const errors: ValidationError[] = [];
  if (message.length === 0) return { ok: false, errors: [{ code: 'empty' }] };
  if (message.length > MESSAGE_LIMITS.maxChars) errors.push({ code: 'too_long', max: MESSAGE_LIMITS.maxChars });

  const bad = [...new Set([...message].filter((c) => !ALLOWED.test(c)))];
  if (bad.length) errors.push({ code: 'unsupported_chars', chars: bad });

  const letters = lettersOf(message);
  const distinct = new Set(letters).size;
  const minLetters = opts.wagered ? MESSAGE_LIMITS.minLettersWagered : MESSAGE_LIMITS.minLettersFriendly;
  if (letters.length < minLetters) errors.push({ code: 'too_few_letters', min: minLetters });
  if (opts.wagered && distinct < MESSAGE_LIMITS.minDistinctWagered) {
    errors.push({ code: 'too_few_distinct', min: MESSAGE_LIMITS.minDistinctWagered });
  }
  if (opts.wagered) {
    if (!opts.isWord) throw new Error('validateMessage: wagered validation requires isWord');
    const unknown = wordsOf(message).filter((w) => !dictionaryAccepts(w, opts.isWord!));
    if (unknown.length) errors.push({ code: 'not_words', words: [...new Set(unknown)] });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, message, shape: shapeOf(message), distinct };
}

export function describeError(e: ValidationError): string {
  switch (e.code) {
    case 'empty':
      return 'Type a message first.';
    case 'too_long':
      return `Keep it to ${e.max} characters or fewer.`;
    case 'unsupported_chars':
      return `These characters aren't in the GT alphabet: ${e.chars.map((c) => `"${c}"`).join(' ')}. Use A–Z, 0–9, space and ${PUNCTUATION.join(' ')}`;
    case 'too_few_letters':
      return `Needs at least ${e.min} letters.`;
    case 'too_few_distinct':
      return `Wagered messages need at least ${e.min} different letters.`;
    case 'not_words':
      return `Wagered messages must be real words. Not recognised: ${e.words.join(', ')}`;
  }
}

/** Compare a solve attempt with the answer on letters and word breaks only. */
export function canonicalPhrase(text: string): string {
  return normaliseMessage(text)
    .replace(/[^A-Z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
