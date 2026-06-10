import fs from 'node:fs/promises'
import path from 'node:path'
import { CFG, sleep } from './config.js'
import { overlayCSS, buildOverlay } from './overlay.js'

/**
 * Record a component bundle page as a JPEG frame sequence + timestamps.
 * Returns { framesDir, framesMeta, coverPath, durationSec, fpsEstimate }
 */
export async function recordComponent(page, comp, opts = {}) {
  const seconds = opts.seconds ?? CFG.recordSeconds
  const framesDir = path.join(CFG.tmpDir, 'frames')
  await fs.rm(framesDir, { recursive: true, force: true })
  await fs.mkdir(framesDir, { recursive: true })

  await page.setViewport({ width: CFG.viewW, height: CFG.viewH, deviceScaleFactor: CFG.dpr })

  let url = comp.bundleUrl
  if (!/[?&]theme=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'theme=dark&dark=true'
  console.log(`[record] loading ${url}`)
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }).catch(e => console.warn('[record] goto:', e.message))
  await sleep(2200) // let the component settle / animations boot

  // fonts for the overlay (best effort; CI has no Inter/Segoe)
  await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap' }).catch(() => {})
  await page.addStyleTag({ content: overlayCSS })
  await page.evaluate(buildOverlay, {
    title: comp.name,
    author: comp.authorName,
    username: comp.authorUsername,
    avatar: comp.avatar || '',
    likes: comp.likes || 0,
    brand: CFG.brandHandle,
  })
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {})

  // interaction targets (excluding our overlay, edges, and chip zones)
  const targets = await page.evaluate(() => {
    const sel = 'button, a, [role="button"], input, textarea, select, [class*="cursor-pointer"]'
    const pts = []
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('#__ig_overlay')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 24 || r.height < 16) continue
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2
      if (cx < 24 || cx > innerWidth - 24) continue
      if (cy < 130 || cy > innerHeight - 200) continue
      const tag = el.tagName.toLowerCase()
      pts.push({
        x: Math.round(cx), y: Math.round(cy),
        kind: (tag === 'input' || tag === 'textarea') ? 'type' : 'click',
        area: Math.round(r.width * r.height),
      })
    }
    pts.sort((a, b) => b.area - a.area)
    // de-dup near-identical points
    const out = []
    for (const p of pts) {
      if (out.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 60)) out.push(p)
      if (out.length >= 4) break
    }
    return out
  })
  const W = CFG.viewW, H = CFG.viewH
  const route = targets.length ? targets : [
    { x: W * 0.50, y: H * 0.46, kind: 'hover' },
    { x: W * 0.32, y: H * 0.60, kind: 'hover' },
    { x: W * 0.68, y: H * 0.55, kind: 'click' },
    { x: W * 0.50, y: H * 0.50, kind: 'hover' },
  ].map(p => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }))
  console.log(`[record] interaction targets: ${targets.length ? targets.map(t => t.kind).join(',') : 'none -> default sweep'}`)

  // ---- capture loop: native device-pixel screenshots (1080x1920) ~30fps ----
  const cdp = await page.createCDPSession()
  const frames = []
  let recording = true
  const captureLoop = (async () => {
    while (recording) {
      try {
        const r = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg', quality: 85, fromSurface: true,
          // clip.scale renders at device pixels -> native 1080x1920 frames
          clip: { x: 0, y: 0, width: CFG.viewW, height: CFG.viewH, scale: CFG.dpr },
        })
        frames.push({ data: r.data, ts: Date.now() / 1000 })
      } catch { /* transient capture miss */ }
    }
  })()

  const t0 = Date.now()
  const elapsed = () => (Date.now() - t0) / 1000

  // ---- choreography (runs while recording) ----
  await sleep(300)
  await page.evaluate(() => window.__igOverlayIn())
  await sleep(700)
  await page.evaluate(() => window.__igCursorShow())

  let cx = W * 0.85, cy = H * 0.92
  const glide = async (x, y, ms) => {
    await page.evaluate((a, b, d) => window.__igCursorTo(a, b, d), x, y, ms)
    const steps = Math.max(8, Math.round(ms / 33))
    const ease = (t) => t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps)
      await page.mouse.move(cx + (x - cx) * e, cy + (y - cy) * e)
      await sleep(ms / steps)
    }
    cx = x; cy = y
  }
  const clickAt = async () => {
    await page.evaluate(() => window.__igCursorClick())
    await page.mouse.down(); await sleep(90); await page.mouse.up()
  }

  const interactBudget = seconds - 2.4 // keep last beats calm
  let typed = false
  let i = 0
  // rest point near (but not on) a target, so click results stay visible
  const restPoint = (t) => ({
    x: Math.min(W - 60, Math.max(60, t.x + (t.x < W / 2 ? 130 : -130))),
    y: Math.min(H - 220, Math.max(140, t.y + 110)),
  })
  while (elapsed() < interactBudget) {
    const t = route[i % route.length]
    await glide(t.x, t.y, 850 + (i === 0 ? 250 : 0))
    if (elapsed() >= interactBudget) break
    if (t.kind === 'type' && !typed) {
      await clickAt()
      await sleep(250)
      await page.keyboard.type('Make it beautiful ✨', { delay: 65 }).catch(() => {})
      typed = true
      await sleep(500)
    } else if (t.kind === 'click') {
      await sleep(420)
      await clickAt()
      await sleep(380)
      const r = restPoint(t)
      await glide(r.x, r.y, 700) // step away so the state change is visible
      await sleep(550)
    } else {
      await sleep(700)
    }
    i++
  }
  // outro: cursor drifts away, follow chip pops
  await page.evaluate(() => window.__igOutro())
  await glide(W * 0.5, H * 0.78, 900)
  while (elapsed() < seconds) await sleep(50)

  recording = false
  await captureLoop

  // ---- persist frames ----
  if (frames.length < seconds * 5) {
    throw new Error(`Too few screencast frames (${frames.length}) — page likely failed to render.`)
  }
  frames.sort((a, b) => a.ts - b.ts)
  const base = frames[0].ts
  const meta = []
  for (let k = 0; k < frames.length; k++) {
    const file = `f${String(k).padStart(5, '0')}.jpg`
    await fs.writeFile(path.join(framesDir, file), Buffer.from(frames[k].data, 'base64'))
    meta.push({ file, t: +(frames[k].ts - base).toFixed(4) })
  }
  const durationSec = meta[meta.length - 1].t
  const fpsEstimate = +(frames.length / Math.max(durationSec, 0.001)).toFixed(1)
  const framesMeta = path.join(CFG.tmpDir, 'frames.json')
  await fs.writeFile(framesMeta, JSON.stringify(meta))
  // cover = a frame from the action-rich middle of the clip
  const coverPath = path.join(CFG.tmpDir, 'cover.jpg')
  await fs.writeFile(coverPath, Buffer.from(frames[Math.floor(frames.length * 0.45)].data, 'base64'))

  console.log(`[record] ${frames.length} frames, ~${fpsEstimate} fps, ${durationSec.toFixed(1)}s`)
  return { framesDir, framesMeta, coverPath, durationSec, fpsEstimate, frameCount: frames.length }
}
