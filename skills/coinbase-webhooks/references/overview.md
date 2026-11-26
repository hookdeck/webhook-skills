# Coinbase Developer Platform (CDP) Webhooks Overview

## What Are CDP Webhooks?

CDP webhooks push real-time events from the Coinbase Developer Platform to your HTTPS
endpoint. You create a **subscription** (via the CDP CLI, REST API or SDK) listing the
event types you want, a target URL, and for onchain activity a set of label filters.
CDP then `POST`s a JSON body for each matching event.

The overview page says: "All CDP webhooks share the same delivery infrastructure,
signature scheme, and subscription API." One verifier covers every domain. The body
shapes do differ by domain (see below).

This skill covers **v2**. Webhooks v1 is deprecated as of January 26th, 2026. See the
[v2 upgrade guide](https://docs.cdp.coinbase.com/webhooks/v2-upgrade). This is not
Coinbase Commerce. For that product, use the
[coinbase-commerce-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/coinbase-commerce-webhooks) skill.

## What Event Types Does CDP Send?

This skill covers the wallet, onchain activity, transfers and onramp/offramp domains,
listed below. CDP also documents
[Customers](https://docs.cdp.coinbase.com/webhooks/customers) webhooks
(`customers.capability.changed`, `customers.requirement.changed`,
`customers.customer.deleted`) and
[Payment Acceptance](https://docs.cdp.coinbase.com/webhooks/payment-acceptance/overview)
webhooks (`acceptance.payment_session.*`, `acceptance.disbursement.*`,
`acceptance.mandate.*`, `oauth.*`, `identity.user.*`). Both use the same
`X-Webhook-Signature` scheme, so the examples' verifier works unchanged and their handlers
acknowledge these events through the default branch. Customers bodies have no envelope
(route on `X-Event-Type`). Payment Acceptance uses `{ eventId, eventType, timestamp, data }`
with a lowercase-d `eventId`, unlike the transfers `eventID`.

### Wallets ([docs](https://docs.cdp.coinbase.com/webhooks/wallets))

| Event | Triggered When |
|-------|----------------|
| `wallet.transaction.created` | Transaction is created |
| `wallet.transaction.signed` | Transaction is signed |
| `wallet.transaction.broadcast` | Transaction is broadcast to the network |
| `wallet.transaction.pending` | Stuck in the mempool for more than 30 seconds (EVM only, not a failure) |
| `wallet.transaction.replaced` | Replaced an existing pending transaction (EVM only) |
| `wallet.transaction.confirmed` | Confirmed onchain |
| `wallet.transaction.failed` | Failed onchain or was replaced |
| `wallet.typed_data.signed` | EVM EIP-712 typed data signed (EVM only) |
| `wallet.message.signed` | Message signed (EVM EIP-191 or Solana) |
| `wallet.hash.signed` | Arbitrary hash signed (EVM only) |
| `wallet.delegation.created` | Delegation grant created for an end user |
| `wallet.delegation.revoked` | Delegation grant revoked |

Solana does **not** support `wallet.transaction.pending` or `wallet.transaction.replaced`.

### Onchain activity ([docs](https://docs.cdp.coinbase.com/webhooks/onchain-activity/overview))

| Event | Triggered When |
|-------|----------------|
| `onchain.activity.detected` | A contract event matching the subscription's label filters fired |
| `wallet.activity.detected` | An EVM transaction matching the subscription's filters was sent or received |
| `wallet.activity.multi` | An ERC-20 transfer involves one of up to 100 monitored addresses ([docs](https://docs.cdp.coinbase.com/webhooks/onchain-activity/multi-address)) |

Onchain activity supports Base mainnet and Base Sepolia only. A single event type,
`onchain.activity.detected`, covers **every** contract event. Filtering happens
server-side through subscription `labels`: `network`, `contract_address`, `event_name`,
`event_signature`, `transaction_from`, `transaction_to` and `params.*`. Labels are
AND-ed, with up to 20 per subscription. You will almost always set `network` and
`contract_address`. The docs pages differ on which of those two is required.

### Transfers ([docs](https://docs.cdp.coinbase.com/webhooks/transfers/overview))

| Event | Triggered When | Guaranteed? |
|-------|----------------|-------------|
| `payments.transfers.quoted` | Transfer recorded as quoted | Best-effort |
| `payments.transfers.processing` | Transfer is processing | Best-effort |
| `payments.transfers.completed` | Terminal success | Always sent |
| `payments.transfers.failed` | Terminal failure | Always sent |
| `payments.transfers.expired` | Quote expired before execution. `data.status` stays `"quoted"` | See note |

`payments.transfers.expired` appears on the
[example-payloads](https://docs.cdp.coinbase.com/webhooks/transfers/example-payloads) page,
but the transfers overview doesn't mention it. Its `data.status` is still `"quoted"`, so
detect expiry from the event type, not the status field.

The docs say: "A transfer that settles directly to a final status, such as a fast transfer
or an instant deposit, can skip them... you can receive `payments.transfers.completed`
without a preceding `payments.transfers.processing`." So never gate logic on an
intermediate event. To confirm current status, call the Get a transfer endpoint rather than
inferring it from event order.

### Onramp / Offramp ([docs](https://docs.cdp.coinbase.com/webhooks/onramp))

`onramp.transaction.created`, `onramp.transaction.updated`, `onramp.transaction.success`,
`onramp.transaction.failed`, `offramp.transaction.created`, `offramp.transaction.updated`,
`offramp.transaction.success`, `offramp.transaction.failed`

## Which Headers Come With Each Delivery?

| Header | Example |
|--------|---------|
| `Content-Type` | `application/json` |
| `X-Event-Id` | `3a3dd092-55ce-4832-97d9-0e1ab928c79b` (UUID) |
| `X-Event-Type` | `onchain.activity.detected` |
| `X-Webhook-Signature` | `t=...,v0=...,h=content-type x-event-id x-event-type,v1=...` |
| `X-Hook0-Signature` | Deprecated alias with the identical value |

Any custom headers set in the subscription's `target.headers` are added as well. **Route on
`X-Event-Type`.** It's present on every delivery, while the event type's location in the
body varies by domain.

## What Do the Payloads Look Like?

CDP uses several body shapes. Read fields defensively.

### Wallet events: flat snake_case, no envelope

```json
{
  "transaction_hash": "0x123...",
  "address": "0xabc...",
  "network": "base-sepolia",
  "user_id": "end-user-123",
  "delegation_id": "d4e5f6...",
  "confirmed_at": "..."
}
```

- `wallet.transaction.pending` adds `pending_since`, `max_fee_per_gas` and
  `max_priority_fee_per_gas`, so you can decide whether to submit a gas replacement.
- **Solana payloads use `transaction_signature` instead of `transaction_hash`.** Code that
  reads only `transaction_hash` silently gets `undefined` on Solana.
- `user_id` and `delegation_id` appear when the transaction went through delegated signing.

### `onchain.activity.detected`: the docs disagree

The onchain-activity overview and v2-upgrade pages publish a **flat snake_case** body:

```json
{
  "block_number": 38218578,
  "contract_address": "0x125E6687d4313864e53df431d5425969c15Eb2F",
  "event_name": "Transfer",
  "event_signature": "Transfer(address,address,uint256)",
  "log_index": 755,
  "network": "base-mainnet",
  "parameters": { "from": "0x...", "to": "0x...", "value": "637064239" },
  "timestamp": "2025-11-15T17:08:24Z",
  "transaction_from": "0x...",
  "transaction_hash": "0x...",
  "transaction_to": "0x..."
}
```

The verify-signatures page publishes an **enveloped camelCase** body for the same event:
`{ "id": "evt_...", "type": "onchain.activity.detected", "createdAt": "...", "data": { "networkId", "blockNumber", "transactionHash", "logIndex", "eventName", "from", "to", "value", ... } }`.

Two of three pages show the flat form, so it's the likely production shape. That's a
majority reading of the docs, not a verified capture. Handle both: read `body.data ?? body`,
then try snake_case and camelCase keys (`network`/`networkId` too). The examples'
`normalizeOnchainActivity` does this.

### `wallet.activity.multi`: enveloped camelCase

```json
{
  "id": "evt_1a2b3c4d5e6f",
  "type": "wallet.activity.multi",
  "createdAt": "2026-04-15T10:01:00.000000Z",
  "data": {
    "subscriptionId": "<SUB_ID>", "network": "base-mainnet",
    "matchedAddress": "0xAddress1", "direction": "to",
    "transactionHash": "0xabc123...", "blockNumber": 40000000,
    "logIndex": 12, "contractAddress": "0x8335...2913",
    "from": "0xAddress2", "to": "0xAddress1", "value": "5000000"
  }
}
```

- `direction` is `to` (your address received), `from` (your address sent) or `both`.
- `value` is the **raw token amount with no decimal adjustment**. For 6-decimal USDC,
  `5000000` is $5.00.
- **Rate limit:** the multi-address page says "2 webhook events per second per project.
  Events that exceed this limit may not be delivered. The rate limit is subject to change."
  The at-least-once guarantee doesn't cover events dropped by this limit. Freshness is about
  2s average from chain tip to delivery.

### Transfers: `{ eventID, eventType, timestamp, data }`

```json
{
  "eventID": "<uuid>",
  "eventType": "payments.transfers.quoted",
  "timestamp": "2025-01-01T00:00:00Z",
  "data": {
    "transferId": "transfer_<uuid>", "status": "quoted",
    "createdAt": "...", "expiresAt": "...",
    "source": { "accountId": "account_<uuid>", "asset": "usd" },
    "sourceAmount": "103.50", "sourceAsset": "usd",
    "target": { "address": "0x8335...2913", "network": "base", "asset": "usdc" },
    "targetAmount": "100.00", "targetAsset": "usdc"
  }
}
```

- Note the capital-D `eventID`.
- `source` and `target` are polymorphic. Each is one of `{accountId, asset}`,
  `{address, network, asset}` or `{paymentMethodId, asset}`.
- Amounts are decimal **strings**.

### Onramp / Offramp: flat camelCase, `eventType` in the body

There are two published sub-shapes:

- **Guest-checkout transaction:** money fields are `{ currency, value }` objects
  (`paymentTotal`, `purchaseAmount`, `coinbaseFee`, `networkFee`, and so on). Other fields
  include `transactionId`, `status` (e.g. `ONRAMP_TRANSACTION_STATUS_IN_PROGRESS`), `type`
  (e.g. `ONRAMP_TRANSACTION_TYPE_BUY_AND_SEND`), `userType` (e.g. `USER_TYPE_GUEST`),
  `walletAddress`, `txHash` and `partnerUserRef`.
- **Headless Onramp API order:** money fields are plain strings, fees come in a
  `fees[]` array of `{feeType, feeAmount, feeCurrency}`, and other fields include `orderId`
  and `status` (e.g. `ONRAMP_ORDER_STATUS_COMPLETED`), `destinationAddress` and
  `destinationNetwork`.

Don't assume a money field is an object or a string.

## How Does Delivery Work?

- **At-least-once:** "Guaranteed delivery: at-least-once delivery for every event."
  **Duplicates are expected.** Exception: `wallet.activity.multi` events above its
  2 events/second per-project rate limit may not be delivered.
- **Retries:** "exponential backoff with up to 60 retries per event".
- **Freshness:** under 500ms end-to-end from chain tip for onchain data events, per the
  overview page. The multi-address page gives about 2s average for `wallet.activity.multi`.
- **Ordering:** the docs don't state an ordering guarantee either way. Design for
  out-of-order arrival.
- **Auto-disable:** a subscription can be disabled after sustained delivery failures. Fix the
  endpoint and re-enable it with the Update Subscription API. A scheduled check that critical
  subscriptions still have `isEnabled: true` is recommended.
- Acknowledge with 2xx quickly and process asynchronously.

### Idempotency keys

| Domain | Key |
|--------|-----|
| Any | `X-Event-Id` header |
| Onchain activity | `transaction_hash` + `log_index` |
| Transfers | `eventID` |
| Payment Acceptance | `eventId` |

## Full Event Reference

- [Webhooks overview](https://docs.cdp.coinbase.com/webhooks/overview)
- [Wallet webhooks](https://docs.cdp.coinbase.com/webhooks/wallets)
- [Onchain activity](https://docs.cdp.coinbase.com/webhooks/onchain-activity/overview)
- [Transfers](https://docs.cdp.coinbase.com/webhooks/transfers/overview)
- [Onramp / Offramp](https://docs.cdp.coinbase.com/webhooks/onramp)
- [Customers](https://docs.cdp.coinbase.com/webhooks/customers)
- [Payment Acceptance](https://docs.cdp.coinbase.com/webhooks/payment-acceptance/overview)
