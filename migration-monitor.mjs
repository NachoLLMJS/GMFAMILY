import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(exec)
const REFRESH_MS = 60 * 60 * 1000
const MAX_PER_GMGN_CATEGORY = 80
const SNAPSHOT_FILE = path.join(process.cwd(), 'data', 'migrated-tokens.json')
const GMGN_COMMAND = `npx gmgn-cli market trenches --chain bsc --type completed --limit ${MAX_PER_GMGN_CATEGORY} --sort-by created_timestamp --direction desc --raw`

const number = (...values) => {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}
const money = value => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '$—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(n < 1 ? 6 : 2)}`
}
const compact = address => {
  const value = String(address || '')
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value
}
const truthyFlag = value => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'

function normalize(row, observedAt) {
  const address = String(row.address || row.token_address || '').toLowerCase()
  const completeTimestamp = number(row.complete_timestamp, row.completed_timestamp)
  const createdTimestamp = number(row.created_timestamp, row.creation_timestamp)
  const change = number(row.price_change_percent1h, row.price_change_1h, row.price_change_percent, row.change1h)
  const symbol = String(row.symbol || row.token_symbol || row.name || 'TOKEN').slice(0, 18)
  return {
    symbol,
    name: String(row.name || row.token_name || symbol).slice(0, 80),
    price: money(row.price),
    rawPrice: number(row.price),
    change: Math.round(change * 100) / 100,
    volume: money(row.volume_24h || row.volume || row.volume_usd),
    rawVolume: number(row.volume_24h, row.volume, row.volume_usd),
    marketCap: money(row.usd_market_cap || row.market_cap || row.marketcap),
    rawMarketCap: number(row.usd_market_cap, row.market_cap, row.marketcap),
    liquidity: money(row.liquidity || row.liquidity_usd),
    rawLiquidity: number(row.liquidity, row.liquidity_usd),
    address,
    displayAddress: compact(address),
    risk: truthyFlag(row.is_honeypot) ? 'HIGH' : number(row.rug_ratio) > 0.3 ? 'WATCH' : 'LOW',
    migrated: true,
    image: typeof row.logo === 'string' && row.logo.startsWith('http') ? row.logo : null,
    imageBase64: typeof row.logo_small_base64 === 'string' && /^[A-Za-z0-9+/=]+$/.test(row.logo_small_base64) ? row.logo_small_base64 : null,
    completedAt: completeTimestamp ? new Date(completeTimestamp * 1000).toISOString() : null,
    createdAt: createdTimestamp ? new Date(createdTimestamp * 1000).toISOString() : null,
    platform: String(row.launchpad_platform || row.launchpad || row.exchange || 'BNB launchpad').slice(0, 80),
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
  }
}

function parseGmgnJson(raw) {
  // GMGN metadata can contain literal control characters inside strings.
  // Replacing C0 controls with spaces preserves the JSON structure and avoids losing a whole hourly scan.
  return JSON.parse(raw.replace(/[\u0000-\u001f]/g, ' '))
}

export async function readMigrationSnapshot() {
  try {
    return JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8'))
  } catch {
    return { source: 'gmgn-trenches-completed', chain: 'bsc', updatedAt: null, fetchedCount: 0, totalTracked: 0, tokens: [] }
  }
}

export async function refreshMigrations() {
  if (!process.env.GMGN_API_KEY) throw new Error('GMGN_API_KEY_MISSING')
  const observedAt = new Date().toISOString()
  const { stdout } = await run(GMGN_COMMAND, {
    cwd: process.cwd(), timeout: 120_000, maxBuffer: 12_000_000, env: process.env, windowsHide: true,
  })
  const parsed = parseGmgnJson(stdout.trim())
  const current = (Array.isArray(parsed.completed) ? parsed.completed : [])
    .map(row => normalize(row, observedAt))
    .filter(token => /^0x[a-f0-9]{40}$/.test(token.address))
  if (!current.length) throw new Error('GMGN_NO_COMPLETED_ROWS')

  const previous = await readMigrationSnapshot()
  const byAddress = new Map((previous.tokens || []).map(token => [token.address, token]))
  for (const token of current) {
    const old = byAddress.get(token.address)
    byAddress.set(token.address, { ...old, ...token, firstSeenAt: old?.firstSeenAt || token.firstSeenAt })
  }
  const tokens = [...byAddress.values()].sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))
  const snapshot = {
    source: 'gmgn-trenches-completed', chain: 'bsc', category: 'completed',
    updatedAt: observedAt, intervalSeconds: REFRESH_MS / 1000,
    fetchedCount: current.length, totalTracked: tokens.length, tokens,
  }
  await mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true })
  const temp = `${SNAPSHOT_FILE}.tmp`
  await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  await rename(temp, SNAPSHOT_FILE)
  return snapshot
}

export function startHourlyMigrationMonitor(onUpdate = () => {}) {
  const state = { running: false, lastSuccessAt: null, lastError: null, nextRunAt: null }
  const tick = async () => {
    if (state.running) return
    state.running = true
    try {
      const snapshot = await refreshMigrations()
      state.lastSuccessAt = snapshot.updatedAt
      state.lastError = null
      onUpdate(snapshot)
    } catch (error) {
      state.lastError = error?.message || 'GMGN_REFRESH_FAILED'
    } finally {
      state.running = false
      state.nextRunAt = new Date(Date.now() + REFRESH_MS).toISOString()
    }
  }
  void tick()
  const timer = setInterval(tick, REFRESH_MS)
  timer.unref?.()
  state.nextRunAt = new Date(Date.now() + REFRESH_MS).toISOString()
  return { state, refreshNow: tick, stop: () => clearInterval(timer) }
}

export { MAX_PER_GMGN_CATEGORY, REFRESH_MS }
