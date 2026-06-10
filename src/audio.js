import fs from 'node:fs/promises'
import path from 'node:path'
import { CFG } from './config.js'

// Self-synthesized lofi/ambient bed — 100% copyright-free, deterministic per seed.

const SR = 44100

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12)

export async function makeAudio(durationSec, seed = 'reel') {
  const rnd = mulberry32(hash(seed))
  const N = Math.ceil((durationSec + 0.3) * SR)
  const L = new Float32Array(N), R = new Float32Array(N)

  const bpm = 84
  const beat = 60 / bpm
  const bar = beat * 4
  // Am7 — Fmaj7 — Cmaj7 — G6
  const chords = [
    [57, 60, 64, 67],
    [53, 57, 60, 64],
    [48, 52, 55, 60],
    [55, 59, 62, 64],
  ]

  // kick envelope first (used to sidechain-duck everything else)
  const duck = new Float32Array(N).fill(1)
  for (let b = 0; b * beat < durationSec + 0.3; b++) {
    const start = Math.floor(b * beat * SR)
    const len = Math.floor(0.26 * SR)
    for (let i = 0; i < len && start + i < N; i++) {
      const t = i / SR
      const env = Math.exp(-t * 11)
      const d = 1 - 0.45 * env
      if (d < duck[start + i]) duck[start + i] = d
    }
  }

  // pad: detuned sines one octave down, lowpassed
  const padL = new Float32Array(N), padR = new Float32Array(N)
  for (let bi = 0; bi * bar < durationSec + 0.3; bi++) {
    const notes = chords[bi % chords.length]
    const t0 = bi * bar
    const t1 = Math.min((bi + 1) * bar + 0.6, N / SR)
    const s0 = Math.floor(t0 * SR), s1 = Math.floor(t1 * SR)
    for (const m of notes) {
      for (const [cents, side] of [[-7, 0], [6, 1]]) {
        const f = midiHz(m - 12) * Math.pow(2, cents / 1200)
        const w = 2 * Math.PI * f / SR
        const ph0 = rnd() * Math.PI * 2
        for (let s = s0; s < s1 && s < N; s++) {
          const t = s / SR - t0
          const att = Math.min(1, t / 0.5)
          const rel = Math.min(1, (t1 - t0 - t) / 0.6)
          const g = 0.055 * att * rel
          const v = Math.sin(ph0 + w * (s - s0)) * g
          if (side === 0) padL[s] += v; else padR[s] += v
        }
      }
    }
  }
  // one-pole lowpass ~1100 Hz
  const alpha = 1 - Math.exp(-2 * Math.PI * 1100 / SR)
  let yl = 0, yr = 0
  for (let i = 0; i < N; i++) {
    yl += alpha * (padL[i] - yl); yr += alpha * (padR[i] - yr)
    L[i] += yl * duck[i]; R[i] += yr * duck[i]
  }

  // pluck arpeggio (8th notes, pentatonic-ish from chord tones, +1 octave)
  const pattern = [0, 2, 1, 3, 2, 0, 3, 1]
  for (let e = 0; e * beat / 2 < durationSec; e++) {
    const t0 = e * beat / 2
    const bi = Math.floor(t0 / bar) % chords.length
    if (rnd() < 0.18) continue // breathing room
    const m = chords[bi][pattern[e % pattern.length]] + 12
    const f = midiHz(m)
    const w = 2 * Math.PI * f / SR
    const vel = 0.5 + rnd() * 0.5
    const pan = e % 2 === 0 ? 0.38 : 0.62
    const s0 = Math.floor(t0 * SR)
    const len = Math.floor(0.34 * SR)
    for (let i = 0; i < len && s0 + i < N; i++) {
      const t = i / SR
      const v = Math.sin(w * i) * Math.exp(-t * 7.5) * 0.11 * vel * duck[s0 + i]
      L[s0 + i] += v * (1 - pan)
      R[s0 + i] += v * pan
    }
  }

  // soft kick (pitch drop sine)
  for (let b = 0; b * beat < durationSec; b++) {
    const s0 = Math.floor(b * beat * SR)
    const len = Math.floor(0.32 * SR)
    let phase = 0
    for (let i = 0; i < len && s0 + i < N; i++) {
      const t = i / SR
      const f = 48 + 70 * Math.exp(-t * 26)
      phase += 2 * Math.PI * f / SR
      const v = Math.sin(phase) * Math.exp(-t * 15) * 0.30
      L[s0 + i] += v; R[s0 + i] += v
    }
  }

  // hats on offbeats (differentiated noise = cheap highpass)
  for (let b = 0; b * beat + beat / 2 < durationSec; b++) {
    const s0 = Math.floor((b * beat + beat / 2) * SR)
    const len = Math.floor(0.07 * SR)
    let prev = 0
    for (let i = 0; i < len && s0 + i < N; i++) {
      const n = rnd() * 2 - 1
      const hp = n - prev; prev = n
      const v = hp * Math.exp(-(i / SR) * 42) * 0.05
      L[s0 + i] += v; R[s0 + i] += v * 0.9
    }
  }

  // vinyl-ish noise bed
  let nl = 0
  for (let i = 0; i < N; i++) {
    nl += 0.04 * ((rnd() * 2 - 1) - nl)
    L[i] += nl * 0.05; R[i] += nl * 0.05
  }

  // master: soft clip, normalize, fade
  let peak = 0
  for (let i = 0; i < N; i++) {
    L[i] = Math.tanh(L[i] * 1.5); R[i] = Math.tanh(R[i] * 1.5)
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  }
  const norm = peak > 0 ? 0.88 / peak : 1
  const fadeIn = 0.4 * SR, fadeOut = 0.9 * SR
  for (let i = 0; i < N; i++) {
    let g = norm
    if (i < fadeIn) g *= i / fadeIn
    if (i > N - fadeOut) g *= Math.max(0, (N - i) / fadeOut)
    L[i] *= g; R[i] *= g
  }

  // 16-bit stereo WAV
  const data = Buffer.alloc(N * 4)
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), i * 4)
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22); header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28)
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(data.length, 40)

  const out = path.join(CFG.tmpDir, 'audio.wav')
  await fs.writeFile(out, Buffer.concat([header, data]))
  return out
}

/** Pick a random user-provided music file if assets/music has any, else null */
export async function pickMusicFile(rndSeed = 'm') {
  try {
    const files = (await fs.readdir(CFG.musicDir)).filter(f => /\.(mp3|m4a|wav|ogg|flac)$/i.test(f))
    if (!files.length) return null
    const rnd = mulberry32(hash(rndSeed))
    return path.join(CFG.musicDir, files[Math.floor(rnd() * files.length)])
  } catch { return null }
}
