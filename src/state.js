import fs from 'node:fs/promises'
import path from 'node:path'
import { CFG } from './config.js'

const file = path.join(CFG.dataDir, 'posted.json')

export async function loadState() {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return {} }
}

export async function markPosted(state, comp, info) {
  state[comp.demoId] = {
    name: comp.name,
    path: comp.path,
    author: comp.authorUsername,
    postedAt: new Date().toISOString(),
    ...info,
  }
  await fs.mkdir(CFG.dataDir, { recursive: true })
  await fs.writeFile(file, JSON.stringify(state, null, 2))
}
