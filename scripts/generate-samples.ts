/**
 * Deterministic instrument synthesiser → 16-bit mono WAV files.
 * One file per (instrument, sounding pitch) the engine can request.
 *
 *   piano  – additive partials with slight inharmonicity and per-partial decay
 *   guitar – Karplus–Strong plucked string with fractional-delay tuning
 *   violin – band-limited bowed sawtooth, delayed vibrato, soft attack
 *   bass   – round plucked low voice (fundamental + 2nd/3rd harmonics)
 *   synth  – band-limited square + detuned saw with a filter-style envelope
 *
 * Output: apps/mobile/public/sounds/<inst>_<midi>.wav and a generated
 * apps/mobile/src/audio/sampleMap.native.ts (static requires for Metro).
 * Run: npm run samples
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { requiredSamples, sampleKey, midiToFrequency, type Instrument } from '../packages/engine/src/index.ts';

const SR = 22_050;
const DUR: Record<Instrument, number> = { piano: 0.9, guitar: 0.9, violin: 0.8, bass: 0.75, synth: 0.65 };
const NYQ_LIMIT = 9_500;

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function envelope(t: number, attack: number, dur: number, release = 0.05): number {
  const a = t < attack ? t / attack : 1;
  const r = t > dur - release ? Math.max(0, (dur - t) / release) : 1;
  return a * r;
}

function piano(f: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const B = 0.0004;
  for (let k = 1; k <= 12; k++) {
    const fk = k * f * Math.sqrt(1 + B * k * k);
    if (fk > NYQ_LIMIT) break;
    const amp = 1 / k ** 1.25;
    const tau = 0.75 / (1 + 0.35 * (k - 1));
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      out[i]! += amp * Math.exp(-t / tau) * Math.sin(2 * Math.PI * fk * t);
    }
  }
  const rnd = seeded(Math.round(f * 1000));
  for (let i = 0; i < Math.min(n, SR * 0.006); i++) out[i]! += (rnd() * 2 - 1) * 0.15 * (1 - i / (SR * 0.006)); // hammer
  for (let i = 0; i < n; i++) out[i]! *= envelope(i / SR, 0.003, n / SR);
  return out;
}

function guitar(f: number, n: number): Float32Array {
  // Karplus–Strong: y[t] = decay · ½(y[t−D] + y[t−D−1]), D tuned fractionally
  // (the two-tap average adds half a sample of delay, hence −0.5).
  const y = new Float32Array(n);
  const D = SR / f - 0.5;
  const Di = Math.floor(D);
  const frac = D - Di;
  const rnd = seeded(Math.round(f * 7919));
  let prev = 0;
  const burst = Di + 2;
  for (let i = 0; i < burst && i < n; i++) {
    prev = 0.55 * prev + 0.45 * (rnd() * 2 - 1); // soft pick: low-passed noise
    y[i] = prev;
  }
  const decay = 0.996;
  for (let t = burst; t < n; t++) {
    const a = y[t - Di]! * (1 - frac) + y[t - Di - 1]! * frac;
    const b = y[t - Di - 1]! * (1 - frac) + y[t - Di - 2]! * frac;
    y[t] = decay * 0.5 * (a + b);
  }
  for (let i = 0; i < n; i++) y[i]! *= envelope(i / SR, 0.002, n / SR, 0.08);
  return y;
}

function violin(f: number, n: number): Float32Array {
  const out = new Float32Array(n);
  let phase = 0;
  const harmonics = Math.floor(NYQ_LIMIT / (f * 1.01));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = t > 0.12 ? 0.0035 * Math.sin(2 * Math.PI * 5.6 * t) * Math.min(1, (t - 0.12) / 0.15) : 0;
    phase += (2 * Math.PI * f * (1 + vib)) / SR;
    let v = 0;
    for (let k = 1; k <= harmonics; k++) v += Math.sin(k * phase) / k * (k <= 3 ? 1 : 0.8 / Math.sqrt(k));
    out[i] = v * envelope(t, 0.08, n / SR, 0.12);
  }
  let lp = 0;
  for (let i = 0; i < n; i++) { lp += 0.55 * (out[i]! - lp); out[i] = lp; }
  return out;
}

function bass(f: number, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.exp(-t / 0.4);
    out[i] = e * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t / 0.15) + 0.15 * Math.sin(6 * Math.PI * f * t) * Math.exp(-t / 0.08));
    out[i]! *= envelope(t, 0.005, n / SR, 0.06);
  }
  return out;
}

function synth(f: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const det = f * 1.006;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const bright = 0.35 + 0.65 * Math.exp(-t / 0.18);
    let sq = 0;
    for (let k = 1; k * f < NYQ_LIMIT; k += 2) sq += (Math.sin(2 * Math.PI * k * f * t) / k) * (k === 1 ? 1 : bright);
    let saw = 0;
    for (let k = 1; k * det < NYQ_LIMIT; k++) saw += (Math.sin(2 * Math.PI * k * det * t) / k) * (k === 1 ? 1 : bright * 0.7);
    const e = t < 0.006 ? t / 0.006 : 0.55 + 0.45 * Math.exp(-(t - 0.006) / 0.12);
    out[i] = (0.6 * sq + 0.4 * saw) * e * envelope(t, 0.001, n / SR, 0.09);
  }
  return out;
}

const SYNTHS: Record<Instrument, (f: number, n: number) => Float32Array> = { piano, guitar, violin, bass, synth };

function toWav(samples: Float32Array): Uint8Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.7 / peak : 1;
  const data = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) data[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i]! * gain * 32767)));
  const buf = new ArrayBuffer(44 + data.byteLength);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + data.byteLength, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, data.byteLength, true);
  new Int16Array(buf, 44).set(data);
  return new Uint8Array(buf);
}

const outDir = new URL('../apps/mobile/public/sounds/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const keys: string[] = [];
let bytes = 0;
for (const { inst, midi } of requiredSamples()) {
  const n = Math.round(DUR[inst] * SR);
  const wav = toWav(SYNTHS[inst](midiToFrequency(midi), n));
  const key = sampleKey(inst, midi);
  writeFileSync(new URL(`${key}.wav`, outDir), wav);
  keys.push(key);
  bytes += wav.byteLength;
}
const mapDir = new URL('../apps/mobile/src/audio/', import.meta.url);
mkdirSync(mapDir, { recursive: true });
writeFileSync(
  new URL('sampleMap.native.ts', mapDir),
  `// GENERATED by scripts/generate-samples.ts — do not edit.\n/* eslint-disable */\nexport const SAMPLE_ASSETS: Record<string, number> = {\n${keys.map((k) => `  '${k}': require('../../public/sounds/${k}.wav'),`).join('\n')}\n};\n`,
);
writeFileSync(
  new URL('sampleMap.web.ts', mapDir),
  `// GENERATED by scripts/generate-samples.ts — do not edit.\n// On web the files are served as static assets from /sounds/.\nexport const SAMPLE_KEYS: readonly string[] = ${JSON.stringify(keys)};\nexport const SAMPLE_ASSETS: Record<string, { uri: string }> = Object.fromEntries(SAMPLE_KEYS.map((k) => [k, { uri: \`/sounds/\${k}.wav\` }]));\n`,
);
console.log(`Wrote ${keys.length} samples (${(bytes / 1024 / 1024).toFixed(2)} MB) and sample maps.`);
