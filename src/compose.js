import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { CFG } from './config.js'

// winget's Links\ffmpeg.exe symlink fails under Node spawn (ENOENT) — locate the real exe
function wingetFfmpeg() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return []
  const base = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
  const found = []
  try {
    for (const d of fsSync.readdirSync(base)) {
      if (!d.startsWith('Gyan.FFmpeg')) continue
      for (const sub of fsSync.readdirSync(path.join(base, d))) {
        const exe = path.join(base, d, sub, 'bin', 'ffmpeg.exe')
        if (fsSync.existsSync(exe)) found.push(exe)
      }
    }
  } catch { /* no winget dir */ }
  return found
}

export function findFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH, 'ffmpeg', ...wingetFfmpeg()].filter(Boolean)
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['-version'], { stdio: 'pipe' })
      if (r.status === 0) return c
    } catch { /* next */ }
  }
  throw new Error('ffmpeg not found. On this machine run the pipeline via GitHub Actions (ffmpeg pre-installed), or set FFMPEG_PATH.')
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-10000) })
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-3000)}`)))
    p.on('error', reject)
  })
}

/**
 * frames + audio -> 1080x1920 H.264 MP4 ready for IG Reels
 */
export async function composeVideo({ framesMeta, audioPath, musicFile, outName, durationSec }) {
  const ffmpeg = findFfmpeg()
  const meta = JSON.parse(await fs.readFile(framesMeta, 'utf8'))
  if (meta.length < 2) throw new Error('Not enough frames to compose')

  const D = Math.min(durationSec, 89)
  // ffconcat with per-frame durations (handles irregular screencast timing)
  const lines = ['ffconcat version 1.0']
  for (let i = 0; i < meta.length; i++) {
    const d = i < meta.length - 1
      ? Math.max(0.001, meta[i + 1].t - meta[i].t)
      : Math.max(0.001, D - meta[i].t)
    lines.push(`file 'frames/${meta[i].file}'`)
    lines.push(`duration ${d.toFixed(4)}`)
  }
  lines.push(`file 'frames/${meta[meta.length - 1].file}'`) // concat demuxer quirk: repeat last
  const listPath = path.join(CFG.tmpDir, 'list.ffconcat')
  await fs.writeFile(listPath, lines.join('\n'))

  await fs.mkdir(CFG.outDir, { recursive: true })
  const outPath = path.join(CFG.outDir, outName)

  const vf = [
    'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos',
    'crop=1080:1920',
    `fps=${CFG.fps}`,
    'format=yuv420p',
    'fade=t=in:st=0:d=0.45',
    `fade=t=out:st=${(D - 0.6).toFixed(2)}:d=0.6`,
  ].join(',')
  const af = [
    'afade=t=in:st=0:d=0.5',
    `afade=t=out:st=${(D - 0.9).toFixed(2)}:d=0.9`,
    'loudnorm=I=-14:TP=-1.5:LRA=11',
  ].join(',')

  const audioArgs = musicFile
    ? ['-stream_loop', '-1', '-i', musicFile]
    : ['-i', audioPath]

  await run(ffmpeg, [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    ...audioArgs,
    '-map', '0:v', '-map', '1:a',
    '-vf', vf, '-af', af,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-profile:v', 'high',
    '-r', String(CFG.fps),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
    '-movflags', '+faststart',
    '-t', D.toFixed(2),
    outPath,
  ])

  const st = await fs.stat(outPath)
  if (st.size < 200_000) throw new Error(`Output video suspiciously small (${st.size} bytes)`)
  console.log(`[compose] ${outPath} (${(st.size / 1e6).toFixed(1)} MB, ${D.toFixed(1)}s)`)
  return outPath
}
