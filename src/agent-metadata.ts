export interface AgentMetadataInput {
  name: string
  strategy: string
  bio: string
  image: string
  endpoint: string
  instructions: string
  maxPosition: string
  dailyLimit: string
}

function optionalPositiveDecimal(value: string, label: string) {
  if (!value) return null
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || Number(value) <= 0) throw new Error(`${label} must be a positive decimal value.`)
  return value
}

export function buildAgentMetadata(input: AgentMetadataInput) {
  if (input.endpoint) {
    const endpoint = new URL(input.endpoint)
    if (endpoint.protocol !== 'https:') throw new Error('Agent service endpoint must use HTTPS.')
  }
  const maxPositionUsd = optionalPositiveDecimal(input.maxPosition, 'Max position')
  const dailyBuyLimitUsd = optionalPositiveDecimal(input.dailyLimit, 'Daily buy limit')
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: input.name || 'Unnamed GMFAMILY Agent',
    description: input.bio || `${input.strategy} agent on BNB Chain`,
    image: input.image,
    services: input.endpoint ? [{ name: 'web', endpoint: input.endpoint }] : [],
    x402Support: false,
    active: true,
    registrations: [],
    supportedTrust: ['reputation'],
    properties: {
      strategy: input.strategy,
      instructions: input.instructions,
      policy: { maxPositionUsd, dailyBuyLimitUsd },
    },
  }
}
