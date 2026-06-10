// Overlay injected INTO the component bundle page: title chip, author credit
// card, brand handle, fake cursor. All inside #__ig_overlay so the recorder
// can exclude it from interaction-target detection.

export const overlayCSS = `
#__ig_overlay, #__ig_overlay * { box-sizing: border-box; margin: 0; padding: 0; }
#__ig_overlay {
  position: fixed; inset: 0; z-index: 2147483600; pointer-events: none;
  font-family: Inter, -apple-system, 'Segoe UI', system-ui, sans-serif;
  --glass: rgba(17, 18, 26, 0.55);
  --line: rgba(255, 255, 255, 0.14);
  --txt: #fff;
  --txt2: rgba(255, 255, 255, 0.66);
}
#__ig_overlay.light { --glass: rgba(255,255,255,0.62); --line: rgba(0,0,0,0.10); --txt: #14151a; --txt2: rgba(20,21,26,0.62); }

#__ig_overlay .chip {
  position: absolute; left: 50%; transform: translateX(-50%) translateY(-16px);
  opacity: 0; transition: all .7s cubic-bezier(.2,.9,.25,1);
  background: var(--glass); border: 1px solid var(--line);
  backdrop-filter: blur(18px) saturate(1.3); -webkit-backdrop-filter: blur(18px) saturate(1.3);
  border-radius: 18px; box-shadow: 0 12px 40px rgba(0,0,0,.28);
}
#__ig_overlay.on .chip { opacity: 1; transform: translateX(-50%) translateY(0); }

#__ig_overlay .title {
  top: 46px; padding: 13px 22px 14px; text-align: center; max-width: 86%;
}
#__ig_overlay .title .kicker {
  font-size: 10.5px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase;
  color: var(--txt2); margin-bottom: 3px;
}
#__ig_overlay .title .name {
  font-size: 21px; font-weight: 800; color: var(--txt); letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 430px;
}

#__ig_overlay .credit {
  bottom: 86px; display: flex; align-items: center; gap: 11px;
  padding: 11px 18px 11px 12px; transition-delay: .15s;
}
#__ig_overlay .credit img.av {
  width: 42px; height: 42px; border-radius: 50%; object-fit: cover;
  border: 1.5px solid var(--line); background: #333;
}
#__ig_overlay .credit .who .by { font-size: 10px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--txt2); }
#__ig_overlay .credit .who .nm { font-size: 15.5px; font-weight: 700; color: var(--txt); line-height: 1.25; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#__ig_overlay .credit .who .src { font-size: 11.5px; font-weight: 500; color: var(--txt2); }
#__ig_overlay .credit .likes {
  margin-left: 6px; display: flex; align-items: center; gap: 5px;
  font-size: 12.5px; font-weight: 700; color: var(--txt);
  background: rgba(255,255,255,.10); border: 1px solid var(--line);
  padding: 6px 10px; border-radius: 12px;
}
#__ig_overlay.light .credit .likes { background: rgba(0,0,0,.06); }
#__ig_overlay .likes svg { width: 12px; height: 12px; fill: #ff5977; }

#__ig_overlay .brand {
  position: absolute; top: 18px; right: 16px; left: auto; transform: none;
  font-size: 11.5px; font-weight: 600; color: var(--txt2);
  padding: 7px 12px; border-radius: 12px; transition-delay: .25s;
}
#__ig_overlay.on .brand { transform: none; }

#__ig_overlay .outro {
  bottom: 170px; padding: 9px 16px; font-size: 12.5px; font-weight: 700; color: var(--txt);
  transform: translateX(-50%) translateY(14px); transition-delay: 0s;
}
#__ig_overlay .outro.show { opacity: 1; transform: translateX(-50%) translateY(0); }
#__ig_overlay .outro:not(.show) { opacity: 0; }

#__ig_cursor {
  position: fixed; z-index: 2147483646; width: 26px; height: 26px; border-radius: 50%;
  background: rgba(255,255,255,.92); box-shadow: 0 2px 14px rgba(0,0,0,.45), inset 0 0 0 1.5px rgba(0,0,0,.10);
  pointer-events: none; transform: translate(-50%, -50%) scale(1); opacity: 0;
  transition: opacity .3s ease;
}
#__ig_cursor.down { transform: translate(-50%, -50%) scale(.82); }
#__ig_cursor .ripple {
  position: absolute; inset: -12px; border-radius: 50%; border: 2px solid rgba(255,255,255,.85);
  opacity: 0; transform: scale(.6);
}
#__ig_cursor .ripple.go { animation: __ig_rip .55s ease-out forwards; }
@keyframes __ig_rip { 0% { opacity: .9; transform: scale(.55); } 100% { opacity: 0; transform: scale(1.7); } }
`

// Serialized into the page with page.evaluate(buildOverlay, data)
export function buildOverlay(data) {
  // adapt chip theme to page brightness
  let light = false
  try {
    const probe = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    let el = probe, bg = null
    while (el) {
      const c = getComputedStyle(el).backgroundColor
      const m = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0.4)) { bg = m; break }
      el = el.parentElement
    }
    if (!bg) {
      const c = getComputedStyle(document.body).backgroundColor.match(/([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
      if (c) bg = c
    }
    if (bg) {
      const lum = 0.2126 * bg[1] + 0.7152 * bg[2] + 0.0722 * bg[3]
      light = lum > 150
    }
  } catch { /* default dark glass */ }

  const root = document.createElement('div')
  root.id = '__ig_overlay'
  if (light) root.classList.add('light')

  const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const likes = data.likes > 0
    ? `<div class="likes"><svg viewBox="0 0 24 24"><path d="M19 19.99V6a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v13.99c0 .81.91 1.28 1.58.81l3.7-2.6a3 3 0 0 1 3.44 0l3.7 2.6c.66.47 1.58 0 1.58-.81Z"/></svg>${data.likes >= 1000 ? (data.likes / 1000).toFixed(1) + 'k' : data.likes}</div>`
    : ''
  const avatar = data.avatar ? `<img class="av" src="${esc(data.avatar)}" alt="">` : '<div class="av"></div>'

  root.innerHTML = `
    <div class="chip title">
      <div class="kicker">✦ today's featured ui</div>
      <div class="name">${esc(data.title)}</div>
    </div>
    <div class="chip credit">
      ${avatar}
      <div class="who">
        <div class="by">Made by</div>
        <div class="nm">${esc(data.author || data.username)}</div>
        ${data.username ? `<div class="src">@${esc(data.username)}</div>` : ''}
      </div>
      ${likes}
    </div>
    ${data.brand ? `<div class="chip brand">${esc(data.brand)}</div>` : ''}
    <div class="chip outro">♥ Follow for daily UI</div>
  `
  document.documentElement.appendChild(root)

  const cur = document.createElement('div')
  cur.id = '__ig_cursor'
  cur.innerHTML = '<div class="ripple"></div>'
  cur.style.left = innerWidth * 0.85 + 'px'
  cur.style.top = innerHeight * 0.92 + 'px'
  document.documentElement.appendChild(cur)

  let anim = null
  window.__igOverlayIn = () => root.classList.add('on')
  window.__igOutro = () => root.querySelector('.outro').classList.add('show')
  window.__igCursorShow = () => { cur.style.opacity = '1' }
  window.__igCursorSet = (x, y) => { cur.style.left = x + 'px'; cur.style.top = y + 'px' }
  window.__igCursorTo = (x, y, ms) => {
    if (anim) cancelAnimationFrame(anim)
    const x0 = parseFloat(cur.style.left), y0 = parseFloat(cur.style.top)
    const t0 = performance.now()
    const ease = t => t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t)
      cur.style.left = x0 + (x - x0) * e + 'px'
      cur.style.top = y0 + (y - y0) * e + 'px'
      if (t < 1) anim = requestAnimationFrame(step)
    }
    anim = requestAnimationFrame(step)
  }
  window.__igCursorClick = () => {
    cur.classList.add('down')
    const r = cur.querySelector('.ripple')
    r.classList.remove('go'); void r.offsetWidth; r.classList.add('go')
    setTimeout(() => cur.classList.remove('down'), 160)
  }
}
