import { decodeEventLog, encodeFunctionData, isAddress } from 'viem'
import { BSC_CHAIN_HEX, type Eip1193Provider } from './wallet'

export const BSC_IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const

export const identityRegistryAbi = [
  { type: 'function', name: 'register', stateMutability: 'nonpayable', inputs: [{ name: 'agentURI', type: 'string' }], outputs: [{ name: 'agentId', type: 'uint256' }] },
  { type: 'event', name: 'Registered', inputs: [
    { indexed: true, name: 'agentId', type: 'uint256' },
    { indexed: false, name: 'agentURI', type: 'string' },
    { indexed: true, name: 'owner', type: 'address' },
  ] },
] as const

export interface RegisterAgentOptions {
  provider: Eip1193Provider
  account: `0x${string}`
  agentUri: string
  registry?: `0x${string}`
}

interface RpcLog { address: string; data: `0x${string}`; topics: readonly `0x${string}`[] }
interface RpcReceipt { status: string; transactionHash: `0x${string}`; logs: RpcLog[] }

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function waitForReceipt(provider: Eip1193Provider, hash: `0x${string}`): Promise<RpcReceipt> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as RpcReceipt | null
    if (receipt) return receipt
    await wait(1_200)
  }
  throw new Error('Registration is still pending. Check the transaction in BscScan before retrying.')
}

export async function registerAgentIdentity(options: RegisterAgentOptions): Promise<{ agentId: bigint; transactionHash: `0x${string}` }> {
  const { provider, account, agentUri } = options
  const registry = options.registry || BSC_IDENTITY_REGISTRY
  if (!isAddress(account)) throw new Error('Connected wallet address is invalid.')
  if (!isAddress(registry)) throw new Error('ERC-8004 registry address is invalid.')
  if (!agentUri.startsWith('data:application/json;base64,') && !/^https:\/\//i.test(agentUri) && !/^ipfs:\/\//i.test(agentUri)) throw new Error('Agent URI must be a data, HTTPS, or IPFS URI.')

  const chainId = await provider.request({ method: 'eth_chainId' })
  if (typeof chainId !== 'string' || chainId.toLowerCase() !== BSC_CHAIN_HEX) throw new Error('Switch to BNB Smart Chain before registering.')
  const accounts = await provider.request({ method: 'eth_accounts' })
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || accounts[0].toLowerCase() !== account.toLowerCase()) throw new Error('Active wallet account changed. Reconnect before registering.')
  const code = await provider.request({ method: 'eth_getCode', params: [registry, 'latest'] })
  if (typeof code !== 'string' || code === '0x' || code === '0x0') throw new Error('ERC-8004 registry contract is not deployed on BNB Smart Chain.')

  const data = encodeFunctionData({ abi: identityRegistryAbi, functionName: 'register', args: [agentUri] })
  const tx = { from: account, to: registry, data }
  const gas = await provider.request({ method: 'eth_estimateGas', params: [tx] })
  const transactionHash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...tx, gas }] })
  if (typeof transactionHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw new Error('Wallet did not return a valid transaction hash.')
  const receipt = await waitForReceipt(provider, transactionHash as `0x${string}`)
  if (receipt.status !== '0x1') throw new Error('ERC-8004 registration reverted onchain.')

  for (const log of receipt.logs || []) {
    if (log.address.toLowerCase() !== registry.toLowerCase()) continue
    try {
      const topics = [...log.topics] as [`0x${string}`, ...`0x${string}`[]]
      const decoded = decodeEventLog({ abi: identityRegistryAbi, eventName: 'Registered', data: log.data, topics })
      const args = decoded.args as { agentId: bigint; owner: string }
      if (args.owner.toLowerCase() !== account.toLowerCase()) continue
      return { agentId: args.agentId, transactionHash: receipt.transactionHash }
    } catch { /* not the registry event */ }
  }
  throw new Error('Transaction confirmed but no matching ERC-8004 Registered event was found.')
}
