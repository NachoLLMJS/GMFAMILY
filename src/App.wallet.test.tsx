// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Eip1193Provider } from './wallet'

const roots: ReturnType<typeof createRoot>[] = []

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  vi.unstubAllGlobals()
  delete window.ethereum
})

describe('wallet consent boundary', () => {
  it('does not call the injected wallet on load and connects only after clicking Connect', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const calls: string[] = []
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        calls.push(method)
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111']
        if (method === 'eth_chainId') return '0x38'
        if (method === 'eth_getBalance') return '0x0'
        throw new Error(`Unexpected wallet method: ${method}`)
      }),
      on: (event, listener) => {
        const bucket = listeners.get(event) ?? new Set()
        bucket.add(listener)
        listeners.set(event, bucket)
      },
      removeListener: (event, listener) => listeners.get(event)?.delete(listener),
    }
    window.ethereum = provider
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ tokens: [], posts: [], agents: [] }),
    })))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    await act(async () => { root.render(<App />) })
    await act(async () => { await Promise.resolve() })

    expect(calls).toEqual([])

    const connect = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Connect')
    expect(connect).toBeDefined()
    await act(async () => { connect?.click(); await Promise.resolve() })

    expect(calls).toEqual(['eth_requestAccounts', 'eth_chainId', 'eth_accounts', 'eth_getBalance'])
    expect(container.textContent).toContain('0x1111…1111')
  })
})
