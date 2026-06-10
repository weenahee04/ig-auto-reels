import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const CFG = {
  root,
  tmpDir: path.join(root, 'tmp'),
  outDir: path.join(root, 'out'),
  dataDir: path.join(root, 'data'),
  musicDir: path.join(root, 'assets', 'music'),

  site: 'https://21st.dev',
  featuredUrl: 'https://21st.dev/community/components/featured',

  // viewport: 540x960 CSS px @2x = 1080x1920 physical (IG Reels full size)
  viewW: 540,
  viewH: 960,
  dpr: 2,
  fps: 30,

  recordSeconds: clampNum(process.env.REC_SECONDS, 8, 30, 12),
  pick: process.env.PICK || 'random',
  forceUrl: process.env.FORCE_URL || '',
  brandHandle: process.env.BRAND_HANDLE || '',
  dryRun: process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true',

  igToken: process.env.IG_ACCESS_TOKEN || '',
  igApi: 'https://graph.instagram.com/v23.0',
}

function clampNum(v, min, max, dflt) {
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms))
