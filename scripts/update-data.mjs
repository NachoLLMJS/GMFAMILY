import { refreshMigrations } from '../migration-monitor.mjs'
import { runPaperCycle } from '../paper-trading.mjs'

if (!process.env.GMGN_API_KEY) throw new Error('GMGN_API_KEY is required')
const snapshot = await refreshMigrations()
const paper = await runPaperCycle(snapshot)
console.log(JSON.stringify({ updatedAt: snapshot.updatedAt, totalTracked: snapshot.totalTracked, cycle: paper.cycle }))
