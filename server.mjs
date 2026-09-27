import express from 'express'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { readMigrationSnapshot, startHourlyMigrationMonitor } from './migration-monitor.mjs'
import { readPaperState, startHourlyPaperTrading } from './paper-trading.mjs'

const app = express()
const port = Number(process.env.PORT || 4174)
const root = path.dirname(fileURLToPath(import.meta.url))
const isVercel = Boolean(process.env.VERCEL)
const tokenImageCache = new Map()

async function envValue(file, key) {
  try {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
    for (const line of lines) {
      const match = line.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`))
      if (match) return match[1].replace(/^['"]|['"]$/g, '')
    }
  } catch {}
  return ''
}

async function loadServerCredential() {
  if (process.env.GMGN_API_KEY) return
  const localConfig = path.join(root, '.env.local')
  const envFile = process.env.GMGN_ENV_FILE || await envValue(localConfig, 'GMGN_ENV_FILE')
  if (!envFile) return
  const value = await envValue(envFile, 'GMGN_API_KEY')
  if (value) process.env.GMGN_API_KEY = value
}

await loadServerCredential()
let snapshot = await readMigrationSnapshot()
let paperState = await readPaperState()
const idleMonitor = { state: { running: false, lastSuccessAt: null, lastError: null, nextRunAt: null }, refreshNow: async () => {}, stop: () => {} }
const monitor = isVercel ? idleMonitor : startHourlyMigrationMonitor(next => { snapshot = next })
const paperMonitor = isVercel ? idleMonitor : startHourlyPaperTrading(async () => {
    snapshot = await readMigrationSnapshot()
    return snapshot
  }, next => { paperState = next })

app.get('/api/health', (_, res) => res.json({
  ok: true,
  product: 'GMFAMILY',
  runtime: isVercel ? 'vercel-snapshot' : 'persistent-local',
  gmgnCredentialPresent: Boolean(process.env.GMGN_API_KEY),
  writesEnabled: Boolean(process.env.VITE_ERC8004_REGISTRY_ADDRESS),
  migrationMonitor: { ...monitor.state, totalTracked: snapshot.totalTracked || 0, fetchedCount: snapshot.fetchedCount || 0 },
  paperTradingMonitor: { ...paperMonitor.state, cycle: paperState.cycle || 0 },
}))

app.get('/api/feed', async (_, res) => {
  paperState = await readPaperState()
  res.json({ ...paperState, accounts: undefined, monitor: paperMonitor.state })
})

app.post('/api/paper-trading/refresh', async (_, res) => {
  if (isVercel) return res.status(405).json({ error: 'READ_ONLY_SERVERLESS_SNAPSHOT' })
  await paperMonitor.refreshNow()
  paperState = await readPaperState()
  res.status(paperState.posts?.length ? 200 : 503).json({ ...paperState, accounts: undefined, monitor: paperMonitor.state })
})

async function migrationResponse(_, res) {
  snapshot = await readMigrationSnapshot()
  if (!snapshot.tokens?.length) {
    return res.status(503).json({ source: 'unavailable', reason: monitor.state.lastError || 'WAITING_FOR_FIRST_GMGN_SCAN', tokens: [] })
  }
  return res.json(publicSnapshot(snapshot, { cached: true, monitor: monitor.state }))
}

function publicSnapshot(value, extra = {}) {
  return {
    ...value,
    ...extra,
    tokens: (value.tokens || []).map(token => ({
      ...token,
      image: `/api/token-image/${token.address}`,
      imageBase64: undefined,
    })),
  }
}

function fallbackTokenImage(address) {
  const hex = address.slice(2).padEnd(40, '0')
  const hue = Number.parseInt(hex.slice(0, 4), 16) % 360
  const cells = []
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (Number.parseInt(hex[(y * 3 + x) % hex.length], 16) % 2 !== 0) continue
      cells.push(`<rect x="${8 + x * 10}" y="${8 + y * 10}" width="9" height="9"/>`)
      if (x < 2) cells.push(`<rect x="${8 + (4 - x) * 10}" y="${8 + y * 10}" width="9" height="9"/>`)
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges"><rect width="64" height="64" fill="hsl(${hue} 42% 16%)"/><g fill="hsl(${hue} 84% 62%)">${cells.join('')}</g></svg>`)
}

app.get('/api/token-image/:address', async (req, res) => {
  const address = String(req.params.address || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(address)) return res.sendStatus(400)
  const cached = tokenImageCache.get(address)
  if (cached) return res.type(cached.type).set('Cache-Control', 'public, max-age=86400').send(cached.body)

  snapshot = await readMigrationSnapshot()
  const token = snapshot.tokens?.find(item => item.address === address)
  if (token?.imageBase64) {
    const body = Buffer.from(token.imageBase64, 'base64')
    if (body.length && body.length <= 2_000_000) {
      const cachedImage = { type: 'image/webp', body }
      tokenImageCache.set(address, cachedImage)
      return res.type(cachedImage.type).set('Cache-Control', 'public, max-age=86400').send(cachedImage.body)
    }
  }
  if (!token) return res.sendStatus(404)
  const generated = { type: 'image/svg+xml', body: fallbackTokenImage(address) }
  tokenImageCache.set(address, generated)
  return res.type(generated.type).set('Cache-Control', 'public, max-age=86400').send(generated.body)
})
app.get('/api/migrations', migrationResponse)
app.get('/api/market', migrationResponse)
app.post('/api/migrations/refresh', async (_, res) => {
  if (isVercel) return res.status(405).json({ error: 'READ_ONLY_SERVERLESS_SNAPSHOT' })
  await monitor.refreshNow()
  snapshot = await readMigrationSnapshot()
  res.status(snapshot.tokens?.length ? 200 : 503).json(publicSnapshot(snapshot, { monitor: monitor.state }))
})

if (process.env.NODE_ENV === 'production' && !isVercel) {
  app.use(express.static(path.join(root, 'dist')))
  app.get('*', (_, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
}
if (!isVercel) app.listen(port, '127.0.0.1', () => console.log(`GMFAMILY API listening on http://127.0.0.1:${port}`))

export default app
