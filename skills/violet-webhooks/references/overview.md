# Violet Webhooks Overview

## What Are Violet Webhooks?

[Violet](https://violet.io) is a unified checkout API that connects channels (apps that sell merchants' products) to merchants' ecommerce platforms. A channel registers a webhook per event and Violet POSTs the related entity to the channel's `remote_endpoint` whenever it changes: orders, offers, merchants, collections, catalog syncs, payout accounts, payment transactions, transfers and recovery cases.

Webhooks are "near real time": a webhook can take several minutes, sometimes 10-15, to arrive after a change on the merchant's platform.

## Request Format

- Method: `POST`, with the entity as a JSON body (the full Order, Offer, PayoutAccount, transfer, ...)
- The body has **no event field**. The event name is in the `X-Violet-Topic` header
- Several events share one entity shape (every `ORDER_*` event sends an Order)

| Header | Meaning |
|--------|---------|
| `X-Violet-Hmac` | Base64 HMAC-SHA256 of the raw body, keyed with the app secret |
| `X-Violet-Topic` | The event name, e.g. `ORDER_SHIPPED` |
| `X-Violet-Event-Id` | Identifies the event (use for idempotency) |
| `X-Violet-Webhook-Id` | The webhook that produced the delivery |
| `X-Violet-Entity-Length` | Body length in bytes |
| `X-Violet-Event-Id-Source` | Marks a resend of an existing event |

Webhook bodies always carry the entity regardless of size. If you can't consume a large body, ignore it and fetch the event by id later ([Retrieving Webhook Events](https://docs.violet.io/prism/webhooks/retrieving-webhook-events)).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ORDER_ACCEPTED` | A merchant accepts an order | Confirm to the shopper |
| `ORDER_UPDATED` | An order changes | Keep your copy in sync |
| `ORDER_COMPLETED` | An order is completed | Fulfilment and receipts |
| `ORDER_SHIPPED` | An order ships | Tracking emails |
| `ORDER_DELIVERED` | An order is delivered | Delivery follow-up |
| `ORDER_REFUNDED` | An order is refunded | Accounting, notifications |
| `ORDER_CANCELLED` | An order is cancelled | Release stock, notify |
| `ORDER_FAILED` | An order fails | Alerting, retry flows |
| `MERCHANT_CONNECTED` | A merchant connects to your app | Onboarding |
| `MERCHANT_DISCONNECTED` | A merchant disconnects | Remove their catalog |
| `MERCHANT_ENABLED` | A merchant is enabled | Show their products |
| `MERCHANT_DISABLED` | A merchant is disabled | Hide their products |
| `MERCHANT_NEEDS_ATTENTION` | A merchant health check fails | Ask the merchant to fix their connection |
| `TRANSFER_SENT` | A payout to a merchant is sent | Reconciliation |

## All Documented Events (52)

- **Order:** `ORDER_ACCEPTED`, `ORDER_UPDATED`, `ORDER_COMPLETED`, `ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_REFUNDED`, `ORDER_CANCELLED`, `ORDER_FAILED`
- **Merchant:** `MERCHANT_CONNECTED`, `MERCHANT_DISCONNECTED`, `MERCHANT_ENABLED`, `MERCHANT_DISABLED`, `MERCHANT_NEEDS_ATTENTION`, `MERCHANT_COMPLETE`
- **Offer:** `OFFER_CREATED` (deprecated), `OFFER_ADDED`, `OFFER_UPDATED`, `OFFER_REMOVED`, `OFFER_DELETED`
- **Collection:** `COLLECTION_CREATED`, `COLLECTION_UPDATED`, `COLLECTION_REMOVED`, `COLLECTION_OFFERS_UPDATED`
- **Sync:** `PRODUCT_SYNC_STARTED`, `PRODUCT_SYNC_COMPLETED`, `PRODUCT_SYNC_FAILED`, `COLLECTION_SYNC_STARTED`, `COLLECTION_SYNC_COMPLETED`, `COLLECTION_SYNC_FAILED`
- **Payout account:** `MERCHANT_PAYOUT_ACCOUNT_CREATED`, `MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED`, `MERCHANT_PAYOUT_ACCOUNT_ACTIVATED`, `MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED`, `MERCHANT_PAYOUT_ACCOUNT_DELETED`
- **Payment transaction:** `PAYMENT_TRANSACTION_CAPTURE_STATUS_UPDATED`, `PAYMENT_TRANSACTION_CAPTURE_STATUS_AUTHORIZED`, `PAYMENT_TRANSACTION_CAPTURE_STATUS_CAPTURED`, `PAYMENT_TRANSACTION_CAPTURE_STATUS_REFUNDED`, `PAYMENT_TRANSACTION_CAPTURE_STATUS_PARTIALLY_REFUNDED`, `PAYMENT_TRANSACTION_CAPTURE_STATUS_FAILED`
- **Transfer:** `TRANSFER_SENT`, `TRANSFER_PARTIALLY_SENT`, `TRANSFER_FAILED`, `TRANSFER_UPDATED`, `TRANSFER_REVERSED`, `TRANSFER_PARTIALLY_REVERSED`, `TRANSFER_REVERSAL_FAILED`
- **Recovery case:** the docs list further `RECOVERY_CASE_*` events (see the events page)

## Delivery and Retries

- Respond 2XX within the first 10 seconds. Queue the request, answer, then validate and process in a separate thread
- A failed event is attempted 10 times with back-off over 24 hours, then it is `FAILED`
- More than 50 failures in a 30 minute window disables delivery for 1 hour, then 3 hours, then up to 24 hours
- If the endpoint still fails after three pauses, the webhook is `DISABLED` until the channel re-activates it, and no events are created while it is disabled

## Full Event Reference

For the complete list of events and their payloads, see [Violet's webhook events documentation](https://docs.violet.io/prism/webhooks/events).
