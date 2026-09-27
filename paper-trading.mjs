import path from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

const HOUR_MS = 60 * 60 * 1000
const STATE_FILE = path.join(process.cwd(), 'data', 'paper-trading.json')
const STARTING_CASH = 1_000
const MAX_POSTS = 240

const AGENTS = [
  { key: 'snapalpha', name: 'Snap Alpha', handle: '@snapalpha', strategy: 'Smart money', avatar: 1, identity: '#281' },
  { key: 'marshhunter', name: 'Marsh Hunter', handle: '@marshhunter', strategy: 'New pairs', avatar: 2, identity: '#322' },
  { key: 'bytejaw', name: 'Bytejaw', handle: '@bytejaw', strategy: 'Momentum', avatar: 3, identity: '#407' },
  { key: 'swampsignal', name: 'Swamp Signal', handle: '@swampsignal', strategy: 'Onchain signals', avatar: 4, identity: '#519' },
  { key: 'goldscale', name: 'Goldscale', handle: '@goldscale', strategy: 'Breakouts', avatar: 5, identity: '#633' },
  { key: 'deepfen', name: 'Deep Fen', handle: '@deepfen', strategy: 'Conviction', avatar: 6, identity: '#718' },
  { key: 'mempoolgator', name: 'Mempool Gator', handle: '@mempoolgator', strategy: 'Flow scanner', avatar: 7, identity: '#801' },
  { key: 'lilypad', name: 'Lilypad', handle: '@lilypad', strategy: 'Mean reversion', avatar: 8, identity: '#844' },
]

const round = (value, decimals = 2) => Number(Number(value || 0).toFixed(decimals))
const money = value => `${Number(value) >= 0 ? '+' : '-'}$${Math.abs(Number(value || 0)).toFixed(2)}`
const hash = value => [...String(value)].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 2166136261)
const rawPrice = token => {
  const direct = Number(token.rawPrice)
  if (Number.isFinite(direct) && direct > 0) return direct
  const parsed = Number(String(token.price || '').replace(/[$,]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function emptyAccount(agent) {
  return { agentKey: agent.key, cash: STARTING_CASH, realizedPnl: 0, wins: 0, losses: 0, trades: 0, positions: {} }
}

export async function readPaperState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'))
  } catch {
    return { mode: 'paper', updatedAt: null, nextRunAt: null, cycle: 0, posts: [], accounts: Object.fromEntries(AGENTS.map(agent => [agent.key, emptyAccount(agent)])), agents: [] }
  }
}

async function savePaperState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true })
  const temp = `${STATE_FILE}.tmp`
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temp, STATE_FILE)
}

function tokenScore(token, agentIndex, cycle) {
  const change = Number(token.change || 0)
  const recency = Date.parse(token.completedAt || token.firstSeenAt || 0) || 0
  return (change * (agentIndex % 3 === 2 ? 4 : 1)) + (recency / 1e13) + ((hash(`${token.address}:${agentIndex}:${cycle}`) % 100) / 100)
}

function makePost({ agent, type, token, text, metric, tone, now, cycle, amount = null, pnl = null }) {
  return {
    id: `${cycle}-${agent.key}-${type}-${token.address || token.symbol}`,
    agentKey: agent.key,
    agent,
    type,
    token: token.symbol,
    tokenAddress: token.address,
    text,
    metric,
    tone,
    timestamp: now,
    simulation: true,
    execution: 'paper',
    amount,
    pnl,
  }
}

export async function runPaperCycle(migrationSnapshot) {
  const tokens = (migrationSnapshot?.tokens || []).filter(token => token.risk !== 'HIGH' && rawPrice(token) > 0)
  if (!tokens.length) throw new Error('PAPER_NO_PRICEABLE_TOKENS')

  const previous = await readPaperState()
  const now = new Date().toISOString()
  const cycle = Number(previous.cycle || 0) + 1
  const accounts = { ...previous.accounts }
  const newPosts = []
  let previousAgent = null

  for (let index = 0; index < AGENTS.length; index += 1) {
    const agent = AGENTS[index]
    const account = { ...emptyAccount(agent), ...(accounts[agent.key] || {}), positions: { ...(accounts[agent.key]?.positions || {}) } }
    const openPositions = Object.values(account.positions)
    const seed = hash(`${now.slice(0, 13)}:${agent.key}:${cycle}`)

    if (openPositions.length && ((seed + cycle + index) % 3 === 0 || openPositions.length >= 3)) {
      const position = openPositions[seed % openPositions.length]
      const token = tokens.find(item => item.address === position.address) || position
      const price = rawPrice(token) || position.lastPrice || position.entryPrice
      const proceeds = position.quantity * price
      const pnl = proceeds - position.cost
      account.cash = round(account.cash + proceeds, 6)
      account.realizedPnl = round(account.realizedPnl + pnl, 6)
      account.trades += 1
      if (pnl >= 0) account.wins += 1
      else account.losses += 1
      delete account.positions[position.address]
      const reply = previousAgent ? `Following ${previousAgent.handle}'s thread, ` : ''
      newPosts.push(makePost({ agent, type: 'SOLD', token, now, cycle, pnl, tone: pnl >= 0 ? 'positive' : 'negative', metric: `${money(pnl)} paper P&L`, text: `${reply}I closed the ${token.symbol} tracked position at the current GMGN snapshot price. The position returned ${money(pnl)} at this snapshot; no wallet transaction was sent.` }))
    } else {
      const held = new Set(Object.keys(account.positions))
      const candidates = tokens.filter(token => !held.has(token.address)).sort((a, b) => tokenScore(b, index, cycle) - tokenScore(a, index, cycle))
      const token = candidates[seed % Math.min(candidates.length, 12)] || tokens[seed % tokens.length]
      const price = rawPrice(token)
      const shouldBuy = account.cash >= 20 && ((seed + index) % 4 !== 0)
      if (shouldBuy) {
        const amount = Math.min(account.cash, 20 + (seed % 31))
        const quantity = amount / price
        account.cash = round(account.cash - amount, 6)
        account.positions[token.address] = { address: token.address, symbol: token.symbol, name: token.name, quantity, cost: amount, entryPrice: price, lastPrice: price, openedAt: now }
        account.trades += 1
        const reply = previousAgent ? `${previousAgent.handle} surfaced ${token.symbol}; ` : ''
        newPosts.push(makePost({ agent, type: 'BOUGHT', token, now, cycle, amount, tone: 'positive', metric: `$${amount.toFixed(2)} paper`, text: `${reply}I opened a tracked position after its completed BSC migration. GMGN shows ${Number(token.change || 0).toFixed(2)}% over 1h with ${token.liquidity || '$—'} liquidity.` }))
      } else {
        newPosts.push(makePost({ agent, type: 'CALL', token, now, cycle, tone: 'neutral', metric: `${Number(token.change || 0).toFixed(2)}% · 1h`, text: `${previousAgent ? `Replying to ${previousAgent.handle}: ` : ''}${token.symbol} is on my hourly GMGN watchlist, but the risk/price setup did not pass my entry rule. I am waiting for the next scan.` }))
      }
    }
    accounts[agent.key] = account
    previousAgent = agent
  }

  const tokenMap = new Map(tokens.map(token => [token.address, token]))
  const leaderboard = AGENTS.map(agent => {
    const account = accounts[agent.key]
    let openValue = 0
    let unrealizedPnl = 0
    for (const position of Object.values(account.positions)) {
      const price = rawPrice(tokenMap.get(position.address)) || position.lastPrice || position.entryPrice
      position.lastPrice = price
      const value = position.quantity * price
      openValue += value
      unrealizedPnl += value - position.cost
    }
    const equity = account.cash + openValue
    const pnl = equity - STARTING_CASH
    return { ...agent, pnl: round(pnl), realizedPnl: round(account.realizedPnl), unrealizedPnl: round(unrealizedPnl), equity: round(equity), cash: round(account.cash), trades: account.trades, winRate: account.wins + account.losses ? round((account.wins / (account.wins + account.losses)) * 100, 1) : 0, openPositions: Object.keys(account.positions).length }
  }).sort((a, b) => b.pnl - a.pnl).map((agent, index) => ({ ...agent, rank: index + 1 }))

  const state = {
    mode: 'paper', source: 'GMGN migrated-token snapshots', disclosure: 'SIMULATED PAPER TRADING — NO FUNDS OR ONCHAIN TRANSACTIONS',
    updatedAt: now, nextRunAt: new Date(Date.now() + HOUR_MS).toISOString(), cycle,
    posts: [...newPosts.reverse(), ...(previous.posts || [])].slice(0, MAX_POSTS),
    accounts, agents: leaderboard,
  }
  await savePaperState(state)
  return state
}

export function startHourlyPaperTrading(getSnapshot, onUpdate = () => {}) {
  const state = { running: false, lastSuccessAt: null, lastError: null, nextRunAt: new Date(Date.now() + HOUR_MS).toISOString() }
  const tick = async () => {
    if (state.running) return
    state.running = true
    try {
      const result = await runPaperCycle(await getSnapshot())
      state.lastSuccessAt = result.updatedAt
      state.lastError = null
      state.nextRunAt = result.nextRunAt
      onUpdate(result)
    } catch (error) {
      state.lastError = error?.message || 'PAPER_CYCLE_FAILED'
      state.nextRunAt = new Date(Date.now() + HOUR_MS).toISOString()
    } finally {
      state.running = false
    }
  }
  void tick()
  const timer = setInterval(tick, HOUR_MS)
  timer.unref?.()
  return { state, refreshNow: tick, stop: () => clearInterval(timer) }
}

export { AGENTS, HOUR_MS as PAPER_REFRESH_MS }
