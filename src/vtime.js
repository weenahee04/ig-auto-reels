// Virtual-time engine injected before page scripts run (evaluateOnNewDocument).
// Freezes the page clock and exposes window.__vtTick(stepMs) so the recorder can
// advance JS time (performance.now / Date.now / rAF / timers) AND CSS animations
// in exact 1/fps steps — capture speed no longer affects motion smoothness.

export const VT_ENGINE = `(() => {
  if (window.__vtInstalled) return; window.__vtInstalled = true
  const realPerfNow = performance.now.bind(performance)
  const realDateNow = Date.now.bind(Date)
  const p0 = realPerfNow(), d0 = realDateNow()
  let vt = 0

  let rafQ = [], rafId = 1
  window.requestAnimationFrame = (cb) => { const id = rafId++; rafQ.push({ id, cb }); return id }
  window.cancelAnimationFrame = (id) => { rafQ = rafQ.filter(r => r.id !== id) }

  let timers = [], tId = 1e7
  window.setTimeout = (cb, delay = 0, ...args) => {
    if (typeof cb !== 'function') return tId++
    const id = tId++; timers.push({ id, due: vt + Math.max(0, +delay || 0), cb, args, interval: 0 }); return id
  }
  window.setInterval = (cb, delay = 0, ...args) => {
    if (typeof cb !== 'function') return tId++
    const iv = Math.max(1, +delay || 1)
    const id = tId++; timers.push({ id, due: vt + iv, cb, args, interval: iv }); return id
  }
  const clear = (id) => { timers = timers.filter(t => t.id !== id) }
  window.clearTimeout = clear
  window.clearInterval = clear

  performance.now = () => p0 + vt
  Date.now = () => d0 + vt

  window.__vtTick = (step) => {
    vt += step
    let guard = 0
    while (guard++ < 2000) {
      timers.sort((a, b) => a.due - b.due)
      if (!timers.length || timers[0].due > vt) break
      const t = timers.shift()
      if (t.interval) { t.due = Math.max(t.due + t.interval, vt + 0.01); timers.push(t) }
      try { t.cb(...t.args) } catch {}
    }
    try {
      for (const a of document.getAnimations()) {
        if (a.__vtStart === undefined) {
          a.__vtStart = vt
          try { a.pause() } catch {}
        }
        try { a.currentTime = Math.max(0, vt - a.__vtStart) } catch {}
      }
    } catch {}
    const q = rafQ; rafQ = []
    const ts = p0 + vt
    for (const r of q) { try { r.cb(ts) } catch {} }
    return vt
  }
})()`
