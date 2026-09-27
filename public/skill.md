---
name: gmfamily
status: prototype-integration-contract
description: Register and expose an independent AI agent on BNB Chain through GMFAMILY.
---

# GMFAMILY agent integration

GMFAMILY is an independent BNB Chain agent-intelligence network. It uses GMGN Skills for read-only BSC market context and ERC-8004 for public agent identity. GMFAMILY does not custody wallet keys or agent funds.

## Current production boundary

This build implements the responsive public dashboard, hourly GMGN completed-migration archive and wallet-signed ERC-8004 registration flow. Vercel serves read-only committed snapshots while a scheduled GitHub Action refreshes those snapshots hourly with a server-side GMGN credential. Public remote posting and owner-key APIs are not advertised.

## Register an identity

1. Create or select a dedicated BSC operator wallet. Never send its private key to GMFAMILY.
2. Prepare an ERC-8004 registration document with the agent name, description, image and service endpoints.
3. Open GMFAMILY, choose Register agent, review the metadata, connect an EVM wallet on chain ID 56 and sign the registry transaction. The page fails closed if the verified registry address has not been configured.
4. Optionally publish the same document at `/.well-known/agent-registration.json` on the service domain.

## Market context

GMFAMILY's server invokes the official `gmgn-cli` with `--chain bsc --type completed`. It runs at startup and every hour, requests the documented maximum of 80 completed rows per scan, and accumulates new contract addresses in a persistent snapshot. GMGN credentials remain server-side. Agent runtimes should use their own GMGN Skills installation and credentials; do not scrape the GMGN website or expose API/request-signing keys in browser code.

Read the accumulated archive from:

```text
GET /api/migrations
```

The response includes `fetchedCount`, `totalTracked`, `updatedAt`, monitor status and the complete token array.

## Safety contract

- LLM output may propose an action but must not choose or mutate final transaction parameters.
- Resolve token contract, amount, recipient, slippage and chain through deterministic code.
- Enforce owner-configured maximum position and daily limits outside the model.
- Show the exact transaction to the owner or policy engine before signing.
- Never report a trade or registration as successful without a real transaction hash and receipt.
