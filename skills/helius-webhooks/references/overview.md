# Helius Webhooks Overview

## What Are Helius Webhooks?

Helius webhooks are real-time HTTP POST notifications about Solana on-chain activity. You register a URL, the addresses to monitor and (for enhanced webhooks) the transaction types you care about, and Helius pushes matching transactions to your endpoint right after they are confirmed.

Helius does not sign webhook payloads. The only built-in authentication is the optional `authHeader` value, which Helius sends back as the `Authorization` header (see [verification.md](verification.md)).

## Webhook Types

| `webhookType` | Delivers |
|---------------|----------|
| `enhanced` | Parsed, human-readable transactions, filtered by transaction type. Failed transactions are not sent. |
| `raw` | Raw Solana transaction data for every transaction touching the addresses. No type filtering, lower latency. Includes failed transactions. |
| `discord` | Formatted messages posted to a Discord channel webhook URL. |
| `enhancedDevnet`, `rawDevnet`, `discordDevnet` | Devnet variants of the above. |

## Common Event Types

Enhanced payloads carry the transaction type in `type`. Choose types in `transactionTypes` when creating the webhook, or use `ANY`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `NFT_SALE` | An NFT is sold on a marketplace | Sales feeds, analytics |
| `SWAP` | A token swap executes | Trading bots, portfolio tracking |
| `TRANSFER` | SOL or tokens move between accounts | Deposit detection, wallet monitoring |
| `NFT_LISTING` | An NFT is listed for sale | Listing alerts |
| `NFT_MINT` | An NFT is minted | Mint tracking |
| `TOKEN_MINT` | A token is minted (only certain programs such as Candy Machine V1 and SPL) | Token launch monitoring |

## Event Payload Structure

The request body is a JSON **array**, one element per transaction. Enhanced elements include:

```json
[
  {
    "type": "NFT_SALE",
    "source": "MAGIC_EDEN",
    "description": "5DxD5V... sold Fox #7637 to CKs1E6... for 72 SOL on MAGIC_EDEN.",
    "signature": "5nNtjezQMYBHvgSQmoRmJPiXGsPAWmJPoGSa64xanqrauogiVzFyGQhKeFataHGXq51jR2hjbzNTkPUpP787HAmL",
    "slot": 171942732,
    "timestamp": 1673445241,
    "fee": 10000,
    "feePayer": "CKs1E69a2e9TmH4mKKLrXFF8kD3ZnwKjoEuXa6sz9WqX",
    "nativeTransfers": [],
    "tokenTransfers": [],
    "accountData": [],
    "events": { "nft": { "type": "NFT_SALE" } }
  }
]
```

`signature` is the Solana **transaction signature** (use it as the idempotency key). Raw webhook elements are plain Solana transactions without `type`.

## Full Event Reference

For every transaction type, see [Helius's transaction types](https://www.helius.dev/docs/webhooks/transaction-types) and the [webhooks overview](https://www.helius.dev/docs/webhooks).
