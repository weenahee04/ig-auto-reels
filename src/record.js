import fs from 'node:fs/promises'
import path from 'node:path'
import { CFG, sleep } from './config.js'
import { overlayCSS, buildOverlay } from './overlay.js'
import { VT_ENGINE } from './vtime.js'

const FPS = 30
const TYPE_TEXT = 'Make it beautiful ✨'

/**
 * Record a component bundle page as a JPEG frame sequence + timestamps.
 * Default mode "stepped": virtual-time, exact 30fps regardless of machine speed.
 * Fallback mode "realtime": RECORD_MODE=realtime (wall-clock capture loop).
 * Returns { framesDir, framesMeta, coverPath, durationSec, fpsEstimate, frameCount }
 */
export async function recordComponent(page, comp, opts = {}) {
  const mode = (process.env.RECORD_MODE || 'stepped').toLowerCase()
  return mode === 'realtime'
    ? recordRealtime(page, comp, opts)
    : recordStepped(page, comp, opts)
}

// ---------- shared helpers ----------

function themedUrl(comp) {
  let url = comp.bundleUrl
  if (!/[?&]theme=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'theme=dark&dark=true'
  return url
}

async function injectOverlay(page, comp) {
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
}

async function findTargets(page) {
  return page.evaluate(() => {
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
    const out = []
    for (const p of pts) {
      if (out.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 60)) out.push(p)
      if (out.length >= 4) break
    }
    return out
  })
}

function defaultRoute(W, H) {
  return [
    { x: W * 0.50, y: H * 0.46, kind: 'hover' },
    { x: W * 0.32, y: H * 0.60, kind: 'hover' },
    { x: W * 0.68, y: H * 0.55, kind: 'click' },
    { x: W * 0.50, y: H * 0.50, kind: 'hover' },
  ].map(p => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }))
}

const restPoint = (t, W, H) => ({
  x: Math.min(W - 60, Math.max(60, t.x + (t.x < W / 2 ? 130 : -130))),
  y: Math.min(H - 220, Math.max(140, t.y + 110)),
})

async function persistFrames(frames, seconds) {
  const framesDir = path.join(CFG.tmpDir, 'frames')
  await fs.rm(framesDir, { recursive: true, force: true })
  await fs.mkdir(framesDir, { recursive: true })
  if (frames.length < seconds * 5) {
    throw new Error(`Too few frames (${frames.length}) — page likely failed to render.`)
  }
  frames.sort((a, b) => a.ts - b.ts)
  const base = frames[0].ts
  const meta = []
  for (let k = 0; k < frames.length; k++) {
    const file = `f${String(k).padStart(5, '0')}.jpg`
    await fs.writeFile(path.join(framesDir, file), Buffer.from(frames[k].data, 'base64'))
    meta.push({ file, t: +(frames[k].ts - base).toFixed(4) })
  }
  const durationSec = meta[meta.length - 1].t + 1 / FPS
  const framesMeta = path.join(CFG.tmpDir, 'frames.json')
  await fs.writeFile(framesMeta, JSON.stringify(meta))
  const coverPath = path.join(CFG.tmpDir, 'cover.jpg')
  await fs.writeFile(coverPath, Buffer.from(frames[Math.floor(frames.length * 0.45)].data, 'base64'))
  const fpsEstimate = +(frames.length / Math.max(durationSec, 0.001)).toFixed(1)
  return { framesDir, framesMeta, coverPath, durationSec, fpsEstimate, frameCount: frames.length }
}

// ---------- stepped (virtual time) recorder ----------

function buildPlan(route, seconds, W, H) {
  const total = Math.round(seconds * FPS)
  const plan = Array.from({ length: total }, () => ({}))
  const T = (sec) => Math.min(total - 1, Math.max(0, Math.round(sec * FPS)))
  const ease = (u) => u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2

  const moveSeg = (t0, t1, from, to) => {
    const k0 = T(t0), k1 = Math.max(T(t1), k0 + 1)
    for (let k = k0; k <= k1; k++) {
      const u = (k - k0) / (k1 - k0)
      const e = ease(u)
      plan[k].move = {
        x: Math.round(from.x + (to.x - from.x) * e),
        y: Math.round(from.y + (to.y - from.y) * e),
      }
    }
  }

  plan[T(0.30)].overlayIn = true
  plan[T(0.95)].cursorShow = true

  let cur = { x: W * 0.85, y: H * 0.92 }
  let t = 1.0
  const budget = seconds - 2.4
  let typed = false
  let i = 0
  while (t < budget && i < 12) {
    const tgt = route[i % route.length]
    const dur = i === 0 ? 1.0 : 0.85
    moveSeg(t, t + dur, cur, tgt)
    cur = { x: tgt.x, y: tgt.y }
    t += dur
    if (t >= budget) break
    if (tgt.kind === 'type' && !typed) {
      plan[T(t + 0.10)].down = true
      plan[Math.min(total - 1, T(t + 0.10) + 2)].up = true
      t += 0.40
      for (const ch of [...TYPE_TEXT]) {
        const k = T(t)
        ;(plan[k].chars = plan[k].chars || []).push(ch)
        t += 0.066
      }
      typed = true
      t += 0.6
    } else if (tgt.kind === 'click') {
      t += 0.40
      plan[T(t)].down = true
      plan[Math.min(total - 1, T(t) + 2)].up = true
      t += 0.42
      const r = restPoint(tgt, W, H)
      moveSeg(t, t + 0.7, cur, r)
      cur = r
      t += 1.2
    } else {
      t += 0.7
    }
    i++
  }
  // calm outro: drift to lower center, follow-chip pops
  const driftAt = Math.min(t, seconds - 1.6)
  moveSeg(driftAt, driftAt + 0.9, cur, { x: W * 0.5, y: H * 0.78 })
  plan[T(seconds - 2.2)].outro = true
  return plan
}

async function recordStepped(page, comp, opts = {}) {
  const seconds = opts.seconds ?? CFG.recordSeconds
  await page.setViewport({ width: CFG.viewW, height: CFG.viewH, deviceScaleFactor: CFG.dpr })
  await page.evaluateOnNewDocument(VT_ENGINE)

  const url = themedUrl(comp)
  console.log(`[record] (stepped 30fps) loading ${url}`)
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }).catch(e => console.warn('[record] goto:', e.message))
  await sleep(1800) // real-time settle: network/fonts; virtual clock stays frozen

  const installed = await page.evaluate(() => !!window.__vtInstalled).catch(() => false)
  if (!installed) {
    console.warn('[record] virtual-time engine missing — falling back to realtime mode')
    return recordRealtime(page, comp, opts)
  }

  // warm up the scene (lets canvas/RAF components paint their first frames)
  for (let k = 0; k < 24; k++) await page.evaluate(s => window.__vtTick(s), 1000 / FPS)

  await injectOverlay(page, comp)
  const targets = await findTargets(page)
  const W = CFG.viewW, H = CFG.viewH
  const route = targets.length ? targets : defaultRoute(W, H)
  console.log(`[record] interaction targets: ${targets.length ? targets.map(t => t.kind).join(',') : 'none -> default sweep'}`)

  const plan = buildPlan(route, seconds, W, H)
  const cdp = await page.createCDPSession()
  const frames = []

  for (let k = 0; k < plan.length; k++) {
    const a = plan[k]
    if (a.overlayIn) await page.evaluate(() => window.__igOverlayIn())
    if (a.cursorShow) await page.evaluate(() => window.__igCursorShow())
    if (a.move) {
      await page.mouse.move(a.move.x, a.move.y)
      await page.evaluate((x, y) => window.__igCursorSet(x, y), a.move.x, a.move.y)
    }
    if (a.down) {
      await page.evaluate(() => window.__igCursorClick())
      await page.mouse.down()
    }
    if (a.up) await page.mouse.up()
    if (a.chars) for (const ch of a.chars) await page.keyboard.type(ch).catch(() => {})
    if (a.outro) await page.evaluate(() => window.__igOutro())

    await page.evaluate(s => window.__vtTick(s), 1000 / FPS)
    try {
      const r = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 85, fromSurface: true,
        clip: { x: 0, y: 0, width: W, height: H, scale: CFG.dpr },
      })
      frames.push({ data: r.data, ts: k / FPS })
    } catch { /* keep timeline; ffconcat durations absorb a missed frame */ }
  }

  const out = await persistFrames(frames, seconds)
  console.log(`[record] ${out.frameCount} frames @ exact ${FPS}fps, ${out.durationSec.toFixed(1)}s`)
  return out
}

// ---------- realtime (wall clock) recorder — fallback ----------

async function recordRealtime(page, comp, opts = {}) {
  const seconds = opts.seconds ?? CFG.recordSeconds
  await page.setViewport({ width: CFG.viewW, height: CFG.viewH, deviceScaleFactor: CFG.dpr })

  const url = themedUrl(comp)
  console.log(`[record] (realtime) loading ${url}`)
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }).catch(e => console.warn('[record] goto:', e.message))
  await sleep(2200)

  await injectOverlay(page, comp)
  const targets = await findTargets(page)
  const W = CFG.viewW, H = CFG.viewH
  const route = targets.length ? targets : defaultRoute(W, H)
  console.log(`[record] interaction targets: ${targets.length ? targets.map(t => t.kind).join(',') : 'none -> default sweep'}`)

  const cdp = await page.createCDPSession()
  const frames = []
  let recording = true
  const captureLoop = (async () => {
    while (recording) {
      try {
        const r = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg', quality: 85, fromSurface: true,
          clip: { x: 0, y: 0, width: W, height: H, scale: CFG.dpr },
        })
        frames.push({ data: r.data, ts: Date.now() / 1000 })
      } catch { /* transient capture miss */ }
    }
  })()

  const t0 = Date.now()
  const elapsed = () => (Date.now() - t0) / 1000

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

  const interactBudget = seconds - 2.4
  let typed = false
  let i = 0
  while (elapsed() < interactBudget) {
    const t = route[i % route.length]
    await glide(t.x, t.y, 850 + (i === 0 ? 250 : 0))
    if (elapsed() >= interactBudget) break
    if (t.kind === 'type' && !typed) {
      await clickAt()
      await sleep(250)
      await page.keyboard.type(TYPE_TEXT, { delay: 65 }).catch(() => {})
      typed = true
      await sleep(500)
    } else if (t.kind === 'click') {
      await sleep(420)
      await clickAt()
      await sleep(380)
      const r = restPoint(t, W, H)
      await glide(r.x, r.y, 700)
      await sleep(550)
    } else {
      await sleep(700)
    }
    i++
  }
  await page.evaluate(() => window.__igOutro())
  await glide(W * 0.5, H * 0.78, 900)
  while (elapsed() < seconds) await sleep(50)

  recording = false
  await captureLoop

  const out = await persistFrames(frames, seconds)
  console.log(`[record] ${out.frameCount} frames, ~${out.fpsEstimate} fps, ${out.durationSec.toFixed(1)}s`)
  return out
}
