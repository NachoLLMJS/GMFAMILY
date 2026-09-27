import { describe, expect, it, vi } from 'vitest'
import { connectBscWallet, readBscWallet, type Eip1193Provider } from './wallet'

function provider(handler: (method: string, params?: unknown[]) => unknown): Eip1193Provider {
  return { request: vi.fn(({ method, params }) => Promise.resolve(handler(method, params as unknown[] | undefined))) }
}

describe('connectBscWallet', () => {
  it('requests consent, switches to BSC, then re-reads the active account', async () => {
    let chain = '0x1'
    const calls: string[] = []
    const ethereum = provider((method) => {
      calls.push(method)
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111']
      if (method === 'eth_chainId') return chain
      if (method === 'wallet_switchEthereumChain') { chain = '0x38'; return null }
      if (method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111']
      if (method === 'eth_getBalance') return '0xde0b6b3a7640000'
      throw new Error(`unexpected ${method}`)
    })

    const state = await connectBscWallet(ethereum)

    expect(state).toEqual({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 56,
      balanceWei: 1_000_000_000_000_000_000n,
    })
    expect(calls).toEqual([
      'eth_requestAccounts',
      'eth_chainId',
      'wallet_switchEthereumChain',
      'eth_chainId',
      'eth_accounts',
      'eth_getBalance',
    ])
  })

  it('adds BSC when the wallet does not know chain 56', async () => {
    let chain = '0x1'
    let added = false
    const calls: string[] = []
    const ethereum = provider((method) => {
      calls.push(method)
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111']
      if (method === 'eth_chainId') return chain
      if (method === 'wallet_switchEthereumChain') {
        if (!added) throw Object.assign(new Error('unknown chain'), { code: 4902 })
        chain = '0x38'; return null
      }
      if (method === 'wallet_addEthereumChain') { added = true; return null }
      if (method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111']
      if (method === 'eth_getBalance') return '0x0'
      throw new Error(`unexpected ${method}`)
    })

    const state = await connectBscWallet(ethereum)

    expect(state.chainId).toBe(56)
    expect(calls).toContain('wallet_addEthereumChain')
  })

  it('restores an already authorized BSC wallet without requesting consent', async () => {
    const calls: string[] = []
    const ethereum = provider((method) => {
      calls.push(method)
      if (method === 'eth_chainId') return '0x38'
      if (method === 'eth_accounts') return ['0x2222222222222222222222222222222222222222']
      if (method === 'eth_getBalance') return '0x2a'
      throw new Error(`unexpected ${method}`)
    })

    await expect(readBscWallet(ethereum)).resolves.toEqual({
      address: '0x2222222222222222222222222222222222222222',
      chainId: 56,
      balanceWei: 42n,
    })
    expect(calls).toEqual(['eth_chainId', 'eth_accounts', 'eth_getBalance'])
  })
})
