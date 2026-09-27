import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'

const RPC_URL = process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
const PANCAKE_V3_ROUTER = '0x1b81D678ffb9C0263b24A97847620C99d213eB14'
const WBNB = '0xae13d989dac2f0debff460ac112a837c89baa7cd'

let key = process.env.GMFAMILY_TESTNET_PRIVATE_KEY
if (!key && process.env.GMFAMILY_TESTNET_ENV_FILE) {
  const envText = await readFile(process.env.GMFAMILY_TESTNET_ENV_FILE, 'utf8').catch(() => '')
  key = envText.match(/^GMFAMILY_TESTNET_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1]
}
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('GMFAMILY_TESTNET_PRIVATE_KEY is missing or invalid')
const account = privateKeyToAccount(key)
const publicClient = createPublicClient({ chain: bscTestnet, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: bscTestnet, transport: http(RPC_URL) })

async function artifact(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'))
}
async function requireCode(address, label) {
  const code = await publicClient.getCode({ address })
  if (!code || code === '0x') throw new Error(`${label} has no runtime bytecode at ${address}`)
}
async function deploy(label, json, args) {
  const hash = await walletClient.deployContract({ abi: json.abi, bytecode: json.bytecode, args })
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 })
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`${label} deployment failed: ${hash}`)
  await requireCode(receipt.contractAddress, label)
  return { address: receipt.contractAddress, transactionHash: hash, blockNumber: receipt.blockNumber.toString() }
}

const chainId = await publicClient.getChainId()
if (chainId !== 97) throw new Error(`Refusing deployment: expected BSC Testnet chain 97, received ${chainId}`)
await Promise.all([
  requireCode(IDENTITY_REGISTRY, 'ERC-8004 Identity Registry'),
  requireCode(PANCAKE_V3_ROUTER, 'PancakeSwap v3 SwapRouter'),
  requireCode(WBNB, 'WBNB'),
])
const balance = await publicClient.getBalance({ address: account.address })
if (balance === 0n) throw new Error(`Testnet deployer ${account.address} has no tBNB`)

const factoryArtifact = await artifact('artifacts/contracts/AgentVaultFactory.sol/AgentVaultFactory.json')
const adapterArtifact = await artifact('artifacts/contracts/PancakeV3Adapter.sol/PancakeV3Adapter.json')
const factory = await deploy('AgentVaultFactory', factoryArtifact, [IDENTITY_REGISTRY])
const adapter = await deploy('PancakeV3Adapter', adapterArtifact, [factory.address, PANCAKE_V3_ROUTER, WBNB])
const deployment = {
  network: 'BSC Testnet', chainId, deployer: account.address,
  identityRegistry: IDENTITY_REGISTRY, pancakeV3Router: PANCAKE_V3_ROUTER, wbnb: WBNB,
  factory, adapter,
}
const out = resolve('deployments/bsc-testnet.json')
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(deployment, null, 2) + '\n')
console.log(JSON.stringify(deployment, null, 2))
