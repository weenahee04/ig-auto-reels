import fs from 'node:fs'
import puppeteer from 'puppeteer'

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

export function resolveExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  try {
    const p = puppeteer.executablePath()
    if (p && fs.existsSync(p)) return p
  } catch { /* no bundled chrome (local dev) */ }
  if (process.platform === 'win32') {
    for (const p of EDGE_PATHS) if (fs.existsSync(p)) return p
  }
  throw new Error('No Chromium-based browser found. Install Chrome via `npx puppeteer browsers install chrome` or set PUPPETEER_EXECUTABLE_PATH.')
}

export async function launchBrowser() {
  return puppeteer.launch({
    executablePath: resolveExecutable(),
    headless: true,
    protocolTimeout: 180000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-color-profile=srgb',
      '--enable-unsafe-swiftshader', // software WebGL for shader components in headless CI
      '--disable-features=TranslateUI',
      '--no-first-run',
    ],
  })
}
