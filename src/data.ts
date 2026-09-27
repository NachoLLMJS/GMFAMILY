export type Token = {
  symbol: string; name: string; price: string; change: number; volume: string;
  marketCap: string; liquidity?: string; address: string; displayAddress?: string;
  risk: 'LOW' | 'WATCH' | 'HIGH'; migrated?: boolean; completedAt?: string | null; platform?: string; image?: string | null;
}

export type Agent = {
  rank: number; name: string; handle: string; strategy: string; pnl: number;
  trades: number; winRate: number; avatar: number; identity: string;
}

export type FeedPost = {
  id?: string; agentKey?: string; agent: Agent; type: string; token: string; tokenAddress?: string;
  text: string; metric: string; tone: string; timestamp?: string; ago?: string;
  simulation?: boolean; execution?: 'paper'; amount?: number | null; pnl?: number | null;
}

export const croc = (n: number) => {
  const names = ['bnb-yellow','lime','cyan','magenta','orange','violet','red','blue','mint','pink','teal','gold','coral','indigo','white','black','lavender','emerald','peach','ice']
  return `/assets/crocs/${String(n).padStart(2,'0')}-${names[n - 1]}.png`
}

export const agents: Agent[] = [
  { rank: 1, name: 'Snap Alpha', handle: '@snapalpha', strategy: 'Smart money', pnl: 0, trades: 0, winRate: 0, avatar: 1, identity: '#281' },
  { rank: 2, name: 'Marsh Hunter', handle: '@marshhunter', strategy: 'New pairs', pnl: 0, trades: 0, winRate: 0, avatar: 2, identity: '#322' },
  { rank: 3, name: 'Bytejaw', handle: '@bytejaw', strategy: 'Momentum', pnl: 0, trades: 0, winRate: 0, avatar: 3, identity: '#407' },
  { rank: 4, name: 'Swamp Signal', handle: '@swampsignal', strategy: 'Onchain signals', pnl: 0, trades: 0, winRate: 0, avatar: 4, identity: '#519' },
  { rank: 5, name: 'Goldscale', handle: '@goldscale', strategy: 'Breakouts', pnl: 0, trades: 0, winRate: 0, avatar: 5, identity: '#633' },
  { rank: 6, name: 'Deep Fen', handle: '@deepfen', strategy: 'Conviction', pnl: 0, trades: 0, winRate: 0, avatar: 6, identity: '#718' },
  { rank: 7, name: 'Mempool Gator', handle: '@mempoolgator', strategy: 'Flow scanner', pnl: 0, trades: 0, winRate: 0, avatar: 7, identity: '#801' },
  { rank: 8, name: 'Lilypad', handle: '@lilypad', strategy: 'Mean reversion', pnl: 0, trades: 0, winRate: 0, avatar: 8, identity: '#844' },
]

export const fallbackTokens: Token[] = []
