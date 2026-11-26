# Alchemy Webhooks Overview

## What Are Alchemy Webhooks?

Alchemy **Notify** webhooks push real-time onchain notifications to your endpoint whenever activity you
care about happens on a supported chain — an address receives funds, an NFT is transferred, or a custom
GraphQL query matches new data. Instead of polling an RPC node, you
register a webhook once and Alchemy delivers an HTTP `POST` with a JSON payload as events occur.

Webhooks are **scoped per chain/network** (e.g. `ETH_MAINNET`, `MATIC_MAINNET`). Each webhook has its
own **signing key** used to authenticate deliveries.

## Common Event Types

The top-level `type` field identifies the webhook. These are the exact strings Alchemy sends:

| Type | Triggered When | Common Use Cases |
|------|----------------|------------------|
| `ADDRESS_ACTIVITY` | ETH, ERC-20, ERC-721 and ERC-1155 transfers involving a tracked address (up to 100k addresses per webhook) | Wallet balance updates, deposit detection, accounting |
| `NFT_ACTIVITY` | ERC-721 / ERC-1155 transfers for tracked NFT contracts | Marketplace feeds, ownership tracking, mint alerts |
| `GRAPHQL` | A **Custom Webhook** GraphQL query matches new onchain data | Arbitrary contract/event monitoring, DeFi triggers |

> `GRAPHQL` is the `type` value for **Custom Webhooks** (defined with a GraphQL query in the dashboard).

The current docs organise webhooks into three categories that line up with these types — **Custom**,
**Address Activity**, and **NFT Activity** — and the Notify API
[create-webhook](https://www.alchemy.com/docs/data/webhooks/webhooks-api-endpoints/notify-api-endpoints/create-webhook)
endpoint accepts exactly these three strings for `webhook_type`.

### Deprecated types

| Type | Status | Payload it used to carry |
|------|--------|--------------------------|
| `MINED_TRANSACTION` | Deprecated 2026-08-30 | `event.network` + `event.transaction` (single tx object) |
| `DROPPED_TRANSACTION` | Deprecated 2026-08-30 | `event.network` + `event.transaction` (single tx object) |
| `NFT_METADATA_UPDATE` | Deprecated 2026-08-30 | `event.network`, `event.contractAddress`, `event.tokenId`, metadata fields |

These three strings were documented as Notify webhook types when this skill was written, but as of
2026-08-30 they no longer appear on any page of Alchemy's webhook documentation — including the
overview, webhook-types, and per-webhook reference pages, and the Notify API `create-webhook` type
enum. Alchemy published no deprecation notice, so the basis here is **observed absence** rather than a
vendor announcement, and **no replacement mapping is claimed** — the payload column above records what
these events looked like historically, not a successor event to migrate to.

To watch a specific transaction reach the chain today, the documented paths are a Custom Webhook
(`GRAPHQL`) with a query matching your transaction, or the `alchemy_minedTransactions` WebSocket
subscription — which is a subscription API, not a webhook, and so out of scope for this skill.

## Event Payload Structure

Alchemy's current (V2) payload shares a common envelope across every type. This is Alchemy's
documented [NFT Activity example](https://www.alchemy.com/docs/reference/nft-activity-webhook), in full:

```json
{
  "webhookId": "wh_5dzeea0ikdnzgq6w",
  "id": "whexs_awxsragnkmh182tl",
  "createdAt": "2024-05-31T21:38:13.912Z",
  "type": "NFT_ACTIVITY",
  "event": {
    "network": "ETH_MAINNET",
    "activity": [
      {
        "fromAddress": "0x715af6b6c6e3aefb97f1f6811ce52db563b38896",
        "toAddress": "0x29469395eaf6f95920e59f858042f0e28d98a20b",
        "contractAddress": "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        "blockNum": "0x1310fe1",
        "hash": "0xe6385e8896aa5de1147f8d324ebeb79640f7a0e6fc87f3685d5e39a531f14ea4",
        "erc721TokenId": "0x1eeb",
        "category": "erc721",
        "log": {
          "address": "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
          "topics": [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x000000000000000000000000715af6b6c6e3aefb97f1f6811ce52db563b38896",
            "0x00000000000000000000000029469395eaf6f95920e59f858042f0e28d98a20b",
            "0x0000000000000000000000000000000000000000000000000000000000001eeb"
          ],
          "data": "0x",
          "blockNumber": "0x1310fe1",
          "transactionHash": "0xe6385e8896aa5de1147f8d324ebeb79640f7a0e6fc87f3685d5e39a531f14ea4",
          "transactionIndex": "0x20",
          "blockHash": "0x50bf5446bee2aff19c2399250c93db840eaab0132e7750ed026acb92c93a92ec",
          "logIndex": "0x9c",
          "removed": false
        }
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `webhookId` | ID of the webhook configuration that produced this delivery |
| `id` | ID of the event — record it and skip repeats, but also key side effects on the transfer (`hash` + `log.logIndex`, or `typeTraceAddress` for internal transfers), since Alchemy doesn't document whether a retry keeps the same `id` |
| `createdAt` | ISO-8601 timestamp of when the event was generated |
| `type` | One of the event types above |
| `event` | Type-specific payload (`network` + `activity`, or GraphQL `data` + `sequenceNumber`) |

The shape of `event` varies by `type`:

- **`ADDRESS_ACTIVITY` / `NFT_ACTIVITY`** — `event.network` + `event.activity[]` (array of transfers).
- **`GRAPHQL`** — `event.data` containing the result of your Custom Webhook GraphQL query, plus
  `event.sequenceNumber`, an incrementing integer for client-side re-org handling.

Token transfers carry `log.removed`, which is `true` when the transaction is in a chain re-org and no
longer in the canonical chain.

(For the shapes the deprecated types carried, see the deprecated-types table above.)

## Delivery, Retries, and Security

- **Signature:** every delivery includes an `X-Alchemy-Signature` header (HMAC-SHA256 hex of the raw
  body). See [verification.md](verification.md).
- **Retries:** non-200 responses and failures to reach your server are retried with exponential backoff
  up to ~10 minutes (Free / Pay-As-You-Go) or ~1 hour (Enterprise). Return `200` quickly to acknowledge
  receipt. Manual retries are listed as coming soon, so backfill gaps from the Transfers API.
- **Ordering:** Alchemy delivers first-time notifications in order; nothing is promised for retries.
- **IP allowlist (optional):** Alchemy delivers from `54.236.136.17` and `34.237.24.169`.

## Full Event Reference

For the complete list of webhook types and payload schemas, see the
[Alchemy Webhooks documentation](https://www.alchemy.com/docs/reference/webhooks-overview).
