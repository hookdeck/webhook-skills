# Crossmint Webhooks Overview

## What Are Crossmint Webhooks?

Crossmint's wallet transfers, checkout, NFT minting and credential issuance run asynchronously, often waiting on a blockchain. Webhooks tell your server when these operations finish. A webhook is a JSON `POST` to an endpoint you add in the Crossmint console. One project-level system carries events from every product, and delivery runs on [Svix](https://www.svix.com/), so each request carries `svix-id`, `svix-timestamp` and `svix-signature` headers. The event name is the top-level `type` in the body.

## What Are the Common Event Types?

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `wallets.transfer.in` | Tokens arrive in a project wallet (confirmed onchain only) | Credit a user balance |
| `wallets.transfer.out` | Tokens leave a project wallet; sent for failed attempts too | Track the full transfer lifecycle, read `data.error` |
| `wallets.signer.exported` | A wallet's private key is exported for the first time | Security alerting |
| `purchase.succeeded` | Checkout V2: an NFT purchase was delivered | Fulfil an order |
| `orders.quote.created` | Checkout V3: a new order is created | Store the order |
| `orders.quote.updated` | Checkout V3: order details change | Refresh stored order data |
| `orders.payment.succeeded` | Checkout V3: payment processed | Mark as paid |
| `orders.payment.failed` | Checkout V3: payment failed | Notify the buyer |
| `orders.delivery.initiated` | Checkout V3: delivery begins | Show progress |
| `orders.delivery.completed` | Checkout V3: delivery succeeded | Fulfil, send receipt |
| `orders.delivery.failed` | Checkout V3: delivery failed | Alert, retry or refund |
| `collections.create.succeeded` | A collection was created | Store the collection id |
| `collections.update.succeeded` | A collection was updated | Sync metadata |
| `nfts.create.succeeded` | A mint succeeded | Record token ids |
| `nfts.create.failed` | A mint failed | Alert, retry |
| `nfts.update.succeeded` | An NFT edit succeeded | Sync metadata |
| `credential.creation.succeeded` | A verifiable credential was issued | Deliver to the holder |
| `credential.creation.failed` | Credential issuance failed | Alert, retry |
| `payment_methods.status.updated` | Offramp: a payment method's status changed | Update account state |

These are the 19 types Crossmint documents; the list may not be exhaustive. Treat any type you don't recognise as informational and return `2xx`.

## Event Payload Structure

Only `type` and `data` are common. The id and surrounding fields depend on the product:

| Product | Envelope |
|---------|----------|
| Wallets | `{ id: "evt_...", type, data }`; `data` has `status`, `token` (`symbol`, `amount`, `decimals`, `locator`, `chain`), `sender`, `recipient`, and on failures `error` |
| Checkout V3 | `{ actionId, type, data }`; `data` has `orderId`, `phase`, `locale`, `lineItems` |
| Checkout V2 | Flat `{ type, status, walletAddress, projectId, collectionId, clientId, txId, contractAddress, tokenIds, passThroughArgs }` (EVM) or `mintAddress` (Solana); no `data` |
| NFT minting | `{ actionId, startedAt, completedAt, type, data, resource }` |
| Credentials | `{ type, data }`, with `data.credential` or `data.error` |
| Offramp | `{ id: "pm-status-...", type, data, timestamp }` |

Use `svix-id` as your idempotency key: it is the same on every retry.

## Delivery

Return a `2xx` within 15 seconds. Crossmint attempts delivery 8 times: immediately, then after 5 s, 5 min, 30 min, 2 h, 5 h, 10 h and 10 h. After that the message is marked failed and can be resent from the console. Delivery is at-least-once, and offramp events can arrive out of order.

## Full Event Reference

See Crossmint's [webhooks overview](https://docs.crossmint.com/introduction/platform/webhooks/overview) and the per-product pages: [wallets](https://docs.crossmint.com/wallets/guides/webhooks), [checkout](https://docs.crossmint.com/payments/advanced/webhooks), [minting](https://docs.crossmint.com/minting/nfts/integrate/webhooks-and-status-apis), [credentials](https://docs.crossmint.com/minting/verifiable-credentials/integrate/webhooks) and [offramp](https://docs.crossmint.com/offramp/guides/manage-orders).
