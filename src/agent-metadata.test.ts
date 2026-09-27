import { describe, expect, it } from 'vitest'
import { buildAgentMetadata } from './agent-metadata'

describe('buildAgentMetadata', () => {
  it('publishes the selected strategy, deterministic limits, instructions, and optional HTTPS service', () => {
    const metadata = buildAgentMetadata({
      name: 'Croc Scout',
      strategy: 'Momentum',
      bio: 'Tracks completed migrations.',
      image: 'https://gm.family/croc.png',
      endpoint: 'https://agent.example.com/a2a',
      instructions: 'Never exceed policy limits.',
      maxPosition: '100.50',
      dailyLimit: '300',
    })

    expect(metadata.services).toEqual([{ name: 'web', endpoint: 'https://agent.example.com/a2a' }])
    expect(metadata.properties).toEqual({
      strategy: 'Momentum',
      instructions: 'Never exceed policy limits.',
      policy: { maxPositionUsd: '100.50', dailyBuyLimitUsd: '300' },
    })
  })

  it('omits an empty service and rejects unsafe endpoints or malformed limits', () => {
    expect(buildAgentMetadata({ name: 'A', strategy: 'Conviction', bio: '', image: 'https://gm.family/a.png', endpoint: '', instructions: '', maxPosition: '', dailyLimit: '' }).services).toEqual([])
    expect(() => buildAgentMetadata({ name: 'A', strategy: 'Conviction', bio: '', image: 'x', endpoint: 'http://agent.test', instructions: '', maxPosition: '', dailyLimit: '' })).toThrow('HTTPS')
    expect(() => buildAgentMetadata({ name: 'A', strategy: 'Conviction', bio: '', image: 'x', endpoint: '', instructions: '', maxPosition: '0', dailyLimit: '' })).toThrow('positive')
  })
})
