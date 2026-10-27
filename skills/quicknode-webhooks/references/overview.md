# Quicknode Webhooks Overview

## What Are Quicknode Webhooks?

Quicknode (quicknode.com) is blockchain infrastructure. Two products POST to an HTTP endpoint you control, and both sign each delivery with the same `X-QN-*` headers:

- **Webhooks**: template-filtered on-chain events (for example matched transactions) pushed to your URL.
- **Streams**: a dataset pipeline (blocks, transactions, receipts, logs and more, historical and real time). Its webhook destination delivers each block or batch.

## Event Types

There are **no event types**. Quicknode sends no event name in the body or in a header. Each stream or webhook delivers the output of its own filter: blocks, transactions, logs or matched events. Handlers dispatch on the **shape** of the payload (or on which URL a given stream or webhook points at).

The examples use clearly labelled illustrative payloads:

| Shape | Source | Handled as |
|-------|--------|------------|
| `{ "data": [...], "metadata": {...} }` | Streams batch | Log item count, `metadata.dataset` and `metadata.network` |
| `[ {...}, ... ]` | Webhooks matched items (e.g. transactions) | Log matched item count |
| anything else | - | Logged as an unrecognised shape |

The real fields depend on the dataset you select for a stream, or the filter you configure for a webhook. See the [Quicknode docs](https://www.quicknode.com/docs/webhooks/getting-started) for the payloads of your product.

## Headers

| Header | Description |
|--------|-------------|
| `X-QN-Signature` | Lowercase hex HMAC-SHA256 digest, no prefix |
| `X-QN-Nonce` | Unique string that prevents replay attacks |
| `X-QN-Timestamp` | The timestamp when the message was signed |

## Delivery and Retries

- **Streams:** your endpoint must return `2xx` within the configured timeout (default 30 s). Quicknode retries every N seconds (default 1) and pauses the stream after N failed retries (default 3). Blocks are delivered in sequence.
- **Webhooks:** Quicknode documents "automatic retries for non-200 responses" and does not state a schedule.

Acknowledge quickly and process in the background; deduplicate on block number or hash and transaction hash in case a delivery arrives more than once (Quicknode doesn't document whether a retry keeps the same `X-QN-Nonce`).

## Compression

Payload compression (gzip) must stay **off**. Quicknode signs the uncompressed JSON while the wire carries gzip bytes, so a verifier that checks the raw request body, including Hookdeck's, fails on compressed deliveries. See [verification.md](verification.md).

## Full Reference

- [Quicknode Webhooks documentation](https://www.quicknode.com/docs/webhooks/getting-started)
- [Validating incoming Streams webhook messages](https://www.quicknode.com/guides/quicknode-products/streams/validating-incoming-streams-webhook-messages)
