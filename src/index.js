import fs from 'node:fs/promises'
import path from 'node:path'
import { CFG } from './config.js'
import { launchBrowser } from './browser.js'
import { scrapeFeatured, resolveBundleUrl, scrapeComponentMeta } from './scrape.js'
import { recordComponent, recordPullStage } from './record.js'
import { deriveVideoUrl, urlOk, preparePullStage } from './pull.js'
import { makeAudio, pickMusicFile } from './audio.js'
import { composeVideo } from './compose.js'
import { buildCaption } from './caption.js'
import { loadState, markPosted } from './state.js'
import { uploadPublic, publishReel } from './post.js'

const slugify = (s) => String(s).toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export async function pickComponent(page, state) {
  if (CFG.forceUrl) {
    const wanted = new URL(CFG.forceUrl).pathname
    try {
      const list = await scrapeFeatured(page)
      const hit = list.find(c => c.path === wanted)
      if (hit) return hit
    } catch { /* featured list unavailable — fall through */ }
    const bundleUrl = await resolveBundleUrl(page, CFG.forceUrl)
    const meta = await scrapeComponentMeta(page, CFG.forceUrl)
    return { ...meta, bundleUrl }
  }
  const list = await scrapeFeatured(page)
  console.log(`[scrape] ${list.length} featured components`)
  const fresh = list.filter(c => !state[c.demoId])
  if (!fresh.length) throw new Error('Every featured component has already been posted — switch tab or reset data/posted.json')
  fresh.sort((a, b) => b.likes - a.likes)
  const pool = CFG.pick === 'top' ? fresh.slice(0, 1) : fresh.slice(0, Math.min(12, fresh.length))
  const comp = pool[Math.floor(Math.random() * pool.length)]
  console.log(`[pick] "${comp.name}" by ${comp.authorName || comp.authorUsername} (♥${comp.likes})`)
  return comp
}

export async function runAll({ dry = false } = {}) {
  const dryRun = dry || CFG.dryRun || !CFG.igToken
  if (dryRun) console.log('=== DRY RUN (no IG post) ===')

  await fs.mkdir(CFG.tmpDir, { recursive: true })
  await fs.mkdir(CFG.outDir, { recursive: true })
  const state = await loadState()

  const browser = await launchBrowser()
  let comp, rec = null
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })
    comp = await pickComponent(page, state)

    if (CFG.source === 'pull' || CFG.source === 'auto') {
      const videoUrl = deriveVideoUrl(comp.previewImg)
      if (videoUrl && await urlOk(videoUrl)) {
        console.log(`[pull] using prerendered demo video: ${videoUrl}`)
        const stageUrl = await preparePullStage(videoUrl)
        rec = await recordPullStage(page, comp, stageUrl)
      } else if (CFG.source === 'pull') {
        throw new Error('No prerendered video for this component — use SOURCE=auto (fallback to recording) instead')
      } else {
        console.log('[pull] no prerendered video — falling back to live recording')
      }
    }
    if (!rec) {
      if (!comp.bundleUrl) comp.bundleUrl = await resolveBundleUrl(page, comp.url)
      rec = await recordComponent(page, comp)
    }
  } finally {
    await browser.close().catch(() => {})
  }

  const musicFile = await pickMusicFile(comp.demoId)
  const audioPath = musicFile ? null : await makeAudio(rec.durationSec, comp.demoId)
  console.log(`[audio] ${musicFile ? 'music file: ' + path.basename(musicFile) : 'synthesized ambient track'}`)

  const date = new Date().toISOString().slice(0, 10)
  const outName = `${date}-${slugify(comp.authorUsername || 'author')}-${slugify(comp.name)}.mp4`
  const videoPath = await composeVideo({
    framesMeta: rec.framesMeta,
    audioPath,
    musicFile,
    outName,
    durationSec: rec.durationSec,
  })

  const caption = buildCaption(comp)
  await fs.writeFile(videoPath.replace(/\.mp4$/, '.caption.txt'), caption)
  await fs.copyFile(rec.coverPath, videoPath.replace(/\.mp4$/, '.cover.jpg'))
  console.log('---- caption ----\n' + caption + '\n-----------------')

  if (dryRun) {
    console.log(`[done] dry run complete -> ${videoPath}`)
    return { videoPath, caption, posted: false }
  }

  const videoUrl = await uploadPublic(videoPath)
  const { mediaId, permalink } = await publishReel({ videoUrl, caption })
  await markPosted(state, comp, { mediaId, permalink })
  console.log(`[done] posted: ${permalink || mediaId}`)
  return { videoPath, caption, posted: true, mediaId, permalink }
}
