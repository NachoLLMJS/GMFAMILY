import { describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { BSC_IDENTITY_REGISTRY, registerAgentIdentity } from './erc8004'
import type { Eip1193Provider } from './wallet'

const ACCOUNT = '0x1111111111111111111111111111111111111111'
const HASH = `0x${'ab'.repeat(32)}`
const URI = 'data:application/json;base64,e30='

function registeredLog(agentId: bigint) {
  const abi = [{ type: 'event', name: 'Registered', inputs: [
    { indexed: true, name: 'agentId', type: 'uint256' },
    { indexed: false, name: 'agentURI', type: 'string' },
    { indexed: true, name: 'owner', type: 'address' },
  ] }] as const
  return {
    address: BSC_IDENTITY_REGISTRY,
    topics: encodeEventTopics({ abi, eventName: 'Registered', args: { agentId, owner: ACCOUNT } }),
    data: encodeAbiParameters([{ type: 'string' }], [URI]),
  }
}

describe('registerAgentIdentity', () => {
  it('authenticates chain/account/code and returns success only from a confirmed Registered event', async () => {
    const methods: string[] = []
    const ethereum: Eip1193Provider = { request: vi.fn(async ({ method }) => {
      methods.push(method)
      if (method === 'eth_chainId') return '0x38'
      if (method === 'eth_accounts') return [ACCOUNT]
      if (method === 'eth_getCode') return '0x60016000'
      if (method === 'eth_estimateGas') return '0x30d40'
      if (method === 'eth_sendTransaction') return HASH
      if (method === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash: HASH, logs: [registeredLog(7n)] }
      throw new Error(`unexpected ${method}`)
    }) }

    const result = await registerAgentIdentity({ provider: ethereum, account: ACCOUNT, agentUri: URI })

    expect(result).toEqual({ agentId: 7n, transactionHash: HASH })
    expect(methods).toEqual(['eth_chainId', 'eth_accounts', 'eth_getCode', 'eth_estimateGas', 'eth_sendTransaction', 'eth_getTransactionReceipt'])
  })

  it('fails before requesting a signature when registry bytecode is missing', async () => {
    const methods: string[] = []
    const ethereum: Eip1193Provider = { request: vi.fn(async ({ method }) => {
      methods.push(method)
      if (method === 'eth_chainId') return '0x38'
      if (method === 'eth_accounts') return [ACCOUNT]
      if (method === 'eth_getCode') return '0x'
      throw new Error(`unexpected ${method}`)
    }) }

    await expect(registerAgentIdentity({ provider: ethereum, account: ACCOUNT, agentUri: URI })).rejects.toThrow('registry contract is not deployed')
    expect(methods).toEqual(['eth_chainId', 'eth_accounts', 'eth_getCode'])
  })
})
