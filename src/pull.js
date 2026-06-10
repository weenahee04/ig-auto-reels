import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CFG } from './config.js'

// 21st.dev card previews ship a prerendered demo video next to the preview
// image: .../preview.{ts}.png  ->  .../video.{ts}.mp4

export function deriveVideoUrl(previewImg) {
  if (!previewImg) return null
  const i = previewImg.lastIndexOf('https://cdn.21st.dev/')
  if (i < 0) return null
  const inner = previewImg.slice(i).split('"')[0]
  let m = inner.match(/^(.*\/)preview\.(\d+)\.png(?:\?.*)?$/)
  if (m) return `${m[1]}video.${m[2]}.mp4`
  m = inner.match(/^(.*\/)preview\.png(?:\?.*)?$/)
  if (m) return `${m[1]}video.mp4`
  return null
}

export async function urlOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' })
    if (r.ok) return true
    const g = await fetch(url, { headers: { Range: 'bytes=0-64' } })
    return g.ok || g.status === 206
  } catch { return false }
}

/** Download the CDN video and write the local 9:16 stage page that frames it. */
export async function preparePullStage(videoUrl) {
  await fs.mkdir(CFG.tmpDir, { recursive: true })
  const vPath = path.join(CFG.tmpDir, 'pullvideo.mp4')
  const res = await fetch(videoUrl)
  if (!res.ok) throw new Error(`video download failed: HTTP ${res.status}`)
  await fs.writeFile(vPath, Buffer.from(await res.arrayBuffer()))

  const W = CFG.viewW, H = CFG.viewH
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#07070c}
video{pointer-events:none}
.bg{position:absolute;left:50%;top:50%;width:${W}px;height:${H}px;transform:translate(-50%,-50%) scale(1.4);object-fit:cover;filter:blur(44px) saturate(1.35) brightness(.5)}
.veil{position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 38%, rgba(7,7,12,0) 0%, rgba(7,7,12,.6) 100%)}
.wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.card{width:${W - 44}px;border-radius:16px;overflow:hidden;box-shadow:0 26px 70px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.09)}
.card video{display:block;width:100%;height:auto}
</style></head><body>
<video class="bg" src="pullvideo.mp4" muted preload="auto"></video>
<div class="veil"></div>
<div class="wrap"><div class="card"><video src="pullvideo.mp4" muted preload="auto"></video></div></div>
</body></html>`
  const sPath = path.join(CFG.tmpDir, 'pullstage.html')
  await fs.writeFile(sPath, html)
  return pathToFileURL(sPath).href
}
