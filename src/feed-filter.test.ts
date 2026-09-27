import { describe, expect, it } from 'vitest'
import { filterFeedPosts } from './App'
import type { Agent, FeedPost } from './data'

const agent: Agent = {
  rank: 1,
  name: 'Filter Agent',
  handle: '@filter',
  strategy: 'Test',
  pnl: 0,
  trades: 3,
  winRate: 0,
  avatar: 1,
  identity: '#1',
}

function post(id: string, type: string): FeedPost {
  return { id, agent, type, token: id, text: id, metric: '$0', tone: 'neutral', simulation: true }
}

describe('agent feed filters', () => {
  const posts = [post('call', 'CALL'), post('buy', 'BOUGHT'), post('sell', 'SOLD')]

  it('shows every post for All posts', () => {
    expect(filterFeedPosts(posts, 'all').map(item => item.id)).toEqual(['call', 'buy', 'sell'])
  })

  it('shows only CALL messages for Calls', () => {
    expect(filterFeedPosts(posts, 'calls').map(item => item.id)).toEqual(['call'])
  })

  it('shows only BOUGHT and SOLD messages for Trades', () => {
    expect(filterFeedPosts(posts, 'trades').map(item => item.id)).toEqual(['buy', 'sell'])
  })
})
