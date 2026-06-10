import { CFG, sleep } from './config.js'

// Parse "1.2k" / "213" -> number
function parseCount(s) {
  if (!s) return 0
  const m = String(s).trim().toLowerCase().match(/([\d.]+)\s*(k|m)?/)
  if (!m) return 0
  const n = parseFloat(m[1])
  return Math.round(n * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1))
}

/**
 * Scrape the featured components list.
 * Returns [{ demoId, name, path, url, authorUsername, authorName, avatar, likes, previewImg }]
 */
export async function scrapeFeatured(page) {
  await page.goto(CFG.featuredUrl, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForSelector('li[data-test="component-card"]', { timeout: 60000 })

  // trigger lazy loading of a few more rows
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2))
    await sleep(1200)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(500)

  const items = await page.evaluate(() => {
    const out = []
    for (const li of document.querySelectorAll('li[data-test="component-card"]')) {
      const a = li.querySelector('a[href^="/community/components/"]')
      if (!a) continue
      const href = a.getAttribute('href')
      const profile = li.querySelector('a[href^="/community/"]:not([href^="/community/components/"])')
      const avatarImg = profile ? profile.querySelector('img') : null
      const nameEl = li.querySelector('p')
      const likeEl = li.querySelector('button span')
      const previewImg = a.querySelector('img')
      out.push({
        demoId: li.dataset.demoId || href,
        name: a.getAttribute('aria-label') || (nameEl ? nameEl.textContent.trim() : href.split('/')[3]),
        path: href,
        authorUsername: profile ? profile.getAttribute('href').split('/').pop() : '',
        authorName: avatarImg ? (avatarImg.getAttribute('alt') || '') : '',
        avatar: avatarImg ? avatarImg.getAttribute('src') : '',
        likesRaw: likeEl ? likeEl.textContent.trim() : '0',
        previewImg: previewImg ? (previewImg.currentSrc || previewImg.src) : '',
      })
    }
    return out
  })

  const seen = new Set()
  const list = []
  for (const it of items) {
    if (seen.has(it.demoId)) continue
    seen.add(it.demoId)
    list.push({
      ...it,
      name: String(it.name || '').replace(/\s+/g, ' ').trim(),
      authorName: String(it.authorName || '').replace(/\s+/g, ' ').trim(),
      url: CFG.site + it.path,
      likes: parseCount(it.likesRaw),
    })
  }
  if (!list.length) throw new Error('Scrape found 0 component cards — page structure may have changed.')
  return list
}

/**
 * Open a component page and extract the standalone demo bundle URL on cdn.21st.dev
 */
export async function resolveBundleUrl(page, componentUrl) {
  await page.goto(componentUrl, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForSelector('iframe[src*="cdn.21st.dev"][src*="bundle"]', { timeout: 60000 })
  return page.evaluate(() => {
    const f = document.querySelector('iframe[src*="cdn.21st.dev"][src*="bundle"]')
    return f ? f.src : null
  })
}

/**
 * Best-effort metadata from a component page when starting from FORCE_URL
 * (so the overlay/caption still have author + name without the featured list).
 */
export async function scrapeComponentMeta(page, componentUrl) {
  const u = new URL(componentUrl)
  const parts = u.pathname.split('/').filter(Boolean) // community/components/author/slug/demo
  const meta = {
    demoId: u.pathname,
    path: u.pathname,
    url: componentUrl,
    name: parts[3] ? parts[3].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'UI Component',
    authorUsername: parts[2] || '',
    authorName: parts[2] || '',
    avatar: '',
    likes: 0,
  }
  try {
    const better = await page.evaluate(() => {
      const profile = document.querySelector('main a[href^="/community/"]:not([href*="/components/"]) img')
      const h1 = document.querySelector('h1')
      return {
        authorName: profile ? profile.getAttribute('alt') : '',
        avatar: profile ? profile.getAttribute('src') : '',
        name: h1 ? h1.textContent.trim() : '',
      }
    })
    if (better.name) meta.name = better.name
    if (better.authorName) meta.authorName = better.authorName
    if (better.avatar) meta.avatar = better.avatar
  } catch { /* keep fallbacks */ }
  return meta
}
