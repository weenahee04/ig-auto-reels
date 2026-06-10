import fs from 'node:fs/promises'
import path from 'node:path'
import { CFG, sleep } from './config.js'

// ---------- temp public hosting (Meta fetches video_url from a public URL) ----------

async function uploadTmpfiles(buf, name) {
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: 'video/mp4' }), name)
  const r = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd })
  if (!r.ok) throw new Error(`tmpfiles HTTP ${r.status}`)
  const j = await r.json()
  const u = j?.data?.url
  if (!u) throw new Error('tmpfiles: no url in response')
  return u.replace('tmpfiles.org/', 'tmpfiles.org/dl/') // direct-download path
}

async function uploadLitterbox(buf, name) {
  const fd = new FormData()
  fd.append('reqtype', 'fileupload')
  fd.append('time', '1h')
  fd.append('fileToUpload', new Blob([buf], { type: 'video/mp4' }), name)
  const r = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: fd })
  const t = (await r.text()).trim()
  if (!r.ok || !t.startsWith('http')) throw new Error(`litterbox: ${t.slice(0, 120)}`)
  return t
}

async function uploadCatbox(buf, name) {
  const fd = new FormData()
  fd.append('reqtype', 'fileupload')
  fd.append('fileToUpload', new Blob([buf], { type: 'video/mp4' }), name)
  const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd })
  const t = (await r.text()).trim()
  if (!r.ok || !t.startsWith('http')) throw new Error(`catbox: ${t.slice(0, 120)}`)
  return t
}

export async function uploadPublic(filePath) {
  const buf = await fs.readFile(filePath)
  const name = path.basename(filePath).replace(/[^\w.-]/g, '_')
  const errors = []
  for (const [label, fn] of [['tmpfiles.org', uploadTmpfiles], ['litterbox', uploadLitterbox], ['catbox', uploadCatbox]]) {
    try {
      const url = await fn(buf, name)
      // verify it is actually publicly fetchable
      const chk = await fetch(url, { headers: { Range: 'bytes=0-128' } })
      if (!chk.ok && chk.status !== 206) throw new Error(`verify HTTP ${chk.status}`)
      console.log(`[upload] hosted on ${label}: ${url}`)
      return url
    } catch (e) {
      errors.push(`${label}: ${e.message}`)
      console.warn(`[upload] ${label} failed: ${e.message}`)
    }
  }
  throw new Error('All public hosts failed:\n' + errors.join('\n'))
}

// ---------- Instagram Graph API (Instagram API with Instagram Login) ----------

async function ig(pathname, { method = 'GET', params = {} } = {}) {
  const url = new URL(`${CFG.igApi}/${pathname}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', CFG.igToken)
  const r = await fetch(url, { method })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) {
    const e = j.error || {}
    throw new Error(`IG API ${pathname} -> ${r.status} ${e.type || ''} ${e.code || ''}: ${e.message || JSON.stringify(j).slice(0, 300)}`)
  }
  return j
}

export async function getMe() {
  const me = await ig('me', { params: { fields: 'user_id,username,account_type' } })
  return { igUserId: me.user_id || me.id, username: me.username, accountType: me.account_type }
}

export async function publishReel({ videoUrl, caption }) {
  if (!CFG.igToken) throw new Error('IG_ACCESS_TOKEN is not set')
  const { igUserId, username } = await getMe()
  console.log(`[ig] posting as @${username} (${igUserId})`)

  const container = await ig(`${igUserId}/media`, {
    method: 'POST',
    params: {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: 'true',
    },
  })
  console.log(`[ig] container ${container.id} created, waiting for processing…`)

  let status = ''
  for (let i = 0; i < 60; i++) {
    await sleep(6000)
    const s = await ig(container.id, { params: { fields: 'status_code,status' } })
    status = s.status_code
    if (status === 'FINISHED') break
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`IG container failed: ${s.status || status}`)
    }
    if (i % 5 === 0) console.log(`[ig] status: ${status}…`)
  }
  if (status !== 'FINISHED') throw new Error('IG container processing timed out (6 min)')

  const pub = await ig(`${igUserId}/media_publish`, { method: 'POST', params: { creation_id: container.id } })
  let permalink = ''
  try {
    const m = await ig(pub.id, { params: { fields: 'permalink' } })
    permalink = m.permalink || ''
  } catch { /* permalink is best-effort */ }
  console.log(`[ig] ✅ published media ${pub.id} ${permalink}`)
  return { mediaId: pub.id, permalink }
}

export async function refreshToken() {
  if (!CFG.igToken) throw new Error('IG_ACCESS_TOKEN is not set')
  const url = new URL('https://graph.instagram.com/refresh_access_token')
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', CFG.igToken)
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(`refresh failed: ${JSON.stringify(j).slice(0, 300)}`)
  return j // { access_token, token_type, expires_in, permissions }
}
