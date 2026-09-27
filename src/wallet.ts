export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

export interface WalletState {
  address: `0x${string}`
  chainId: number
  balanceWei: bigint
}

export const BSC_CHAIN_ID = 56
export const BSC_CHAIN_HEX = '0x38'

function parseChainId(value: unknown) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('Wallet returned an invalid chain ID.')
  return Number.parseInt(value, 16)
}

function parseAddress(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/i.test(value)) throw new Error('Wallet returned an invalid account.')
  return value as `0x${string}`
}

async function readAuthorizedState(provider: Eip1193Provider, chainId: number): Promise<WalletState> {
  const accounts = await provider.request({ method: 'eth_accounts' })
  if (!Array.isArray(accounts) || !accounts.length) throw new Error('Wallet did not expose an authorized account.')
  const address = parseAddress(accounts[0])
  const rawBalance = await provider.request({ method: 'eth_getBalance', params: [address, 'latest'] })
  if (typeof rawBalance !== 'string' || !/^0x[0-9a-f]+$/i.test(rawBalance)) throw new Error('Wallet returned an invalid balance.')
  return { address, chainId, balanceWei: BigInt(rawBalance) }
}

export async function readBscWallet(provider: Eip1193Provider): Promise<WalletState> {
  const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }))
  if (chainId !== BSC_CHAIN_ID) throw new Error('Switch to BNB Smart Chain to continue.')
  return readAuthorizedState(provider, chainId)
}

export async function connectBscWallet(provider: Eip1193Provider): Promise<WalletState> {
  await provider.request({ method: 'eth_requestAccounts' })
  let chainId = parseChainId(await provider.request({ method: 'eth_chainId' }))
  if (chainId !== BSC_CHAIN_ID) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_HEX }] })
    } catch (error: unknown) {
      if ((error as { code?: number })?.code !== 4902) throw error
      await provider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: BSC_CHAIN_HEX,
        chainName: 'BNB Smart Chain',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
        blockExplorerUrls: ['https://bscscan.com'],
      }] })
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_HEX }] })
    }
    chainId = parseChainId(await provider.request({ method: 'eth_chainId' }))
  }
  if (chainId !== BSC_CHAIN_ID) throw new Error('Switch to BNB Smart Chain to continue.')
  return readAuthorizedState(provider, chainId)
}
