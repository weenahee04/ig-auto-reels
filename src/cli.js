import { CFG } from './config.js'
import { runAll } from './index.js'

const cmd = process.argv[2] || 'run'
const flags = new Set(process.argv.slice(3))

try {
  if (cmd === 'run') {
    await runAll({ dry: flags.has('--dry') })
  } else if (cmd === 'make') {
    await runAll({ dry: true })
  } else if (cmd === 'scrape') {
    const { launchBrowser } = await import('./browser.js')
    const { scrapeFeatured } = await import('./scrape.js')
    const b = await launchBrowser()
    try {
      const page = await b.newPage()
      await page.setViewport({ width: 1280, height: 900 })
      const list = await scrapeFeatured(page)
      for (const c of list) console.log(`♥${String(c.likes).padStart(5)}  ${c.name}  — ${c.authorName || c.authorUsername}  (${c.path})`)
      console.log(`\n${list.length} components`)
    } finally { await b.close() }
  } else if (cmd === 'ig-check') {
    const { getMe } = await import('./post.js')
    const me = await getMe()
    console.log(`✅ token ใช้ได้: @${me.username} (${me.accountType}) id=${me.igUserId}`)
  } else if (cmd === 'refresh-token') {
    const { refreshToken } = await import('./post.js')
    const j = await refreshToken()
    console.log(`✅ token ใหม่ (หมดอายุใน ${Math.round(j.expires_in / 86400)} วัน):\n${j.access_token}`)
  } else {
    console.log('commands: run [--dry] | make | scrape | ig-check | refresh-token')
    process.exit(2)
  }
} catch (e) {
  console.error('❌', e.message)
  process.exit(1)
}
