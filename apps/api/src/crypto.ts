/**
 * Cryptography: all keys derive from GT_SECRET via HKDF-SHA256, so a deployment
 * needs exactly one secret. Tokens are random 256-bit values stored only as
 * hashes. Challenge secrets and sound tokens use AES-256-GCM.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ea = enc.encode(a);
  const eb = enc.encode(b);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean };
  if (subtle.timingSafeEqual) return subtle.timingSafeEqual(ea, eb);
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

interface Keys {
  aes: CryptoKey;
  soundAes: CryptoKey;
  soundIv: CryptoKey;
  recovery: CryptoKey;
}

const cache = new Map<string, Promise<Keys>>();

async function hkdf(base: CryptoKey, info: string, usage: 'aes' | 'hmac'): Promise<CryptoKey> {
  const params = { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('gt-getting-there/v1'), info: enc.encode(info) };
  return usage === 'aes'
    ? crypto.subtle.deriveKey(params, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    : crypto.subtle.deriveKey(params, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
}

export function keysFor(secret: string): Promise<Keys> {
  if (!secret || secret.length < 32) throw new Error('GT_SECRET must be set (32+ characters). See docs/DEPLOY.md.');
  let k = cache.get(secret);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
      return {
        aes: await hkdf(base, 'challenge-secret', 'aes'),
        soundAes: await hkdf(base, 'sound-token', 'aes'),
        soundIv: await hkdf(base, 'sound-token-iv', 'hmac'),
        recovery: await hkdf(base, 'recovery-key', 'hmac'),
      };
    })();
    cache.set(secret, k);
  }
  return k;
}

export async function sealJson(secret: string, value: unknown): Promise<string> {
  const { aes } = await keysFor(secret);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(value)));
  return `${b64url(iv)}.${b64url(ct)}`;
}

export async function openJson<T>(secret: string, sealed: string): Promise<T> {
  const { aes } = await keysFor(secret);
  const [iv, ct] = sealed.split('.');
  if (!iv || !ct) throw new Error('bad sealed value');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, aes, fromB64url(ct));
  return JSON.parse(dec.decode(pt)) as T;
}

/** Deterministic (SIV-style) sealing for sound tokens: same note → same token, so clients can cache. */
export async function sealSound(secret: string, plain: string): Promise<string> {
  const { soundAes, soundIv } = await keysFor(secret);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', soundIv, enc.encode(plain)));
  const iv = mac.slice(0, 12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, soundAes, enc.encode(plain));
  return `${b64url(iv)}${b64url(ct)}`;
}

export async function openSound(secret: string, token: string): Promise<string | null> {
  try {
    const { soundAes } = await keysFor(secret);
    const iv = fromB64url(token.slice(0, 16));
    const ct = fromB64url(token.slice(16));
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, soundAes, ct));
  } catch {
    return null;
  }
}

export async function recoveryHash(secret: string, recoveryKey: string): Promise<string> {
  const { recovery } = await keysFor(secret);
  const sig = await crypto.subtle.sign('HMAC', recovery, enc.encode(normaliseRecoveryKey(recoveryKey)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 130-bit recovery key in Crockford base32, grouped for humans: XXXXX-XXXXX-… (26 chars). */
export function newRecoveryKey(): string {
  const bytes = randomBytes(17);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  out = out.slice(0, 26);
  return out.match(/.{1,5}/g)!.join('-');
}

/** Accept lowercase, missing dashes and the usual look-alikes (O→0, I/L→1). */
export function normaliseRecoveryKey(key: string): string {
  return key
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function newToken(): string {
  return b64url(randomBytes(32));
}
