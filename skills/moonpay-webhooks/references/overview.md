# MoonPay Webhooks Overview

## What Are MoonPay Webhooks?

MoonPay (a crypto on/off ramp) sends HTTP `POST` requests with a JSON body to endpoints you register in the dashboard's Webhooks settings. They report asynchronous changes: buy and sell transaction status, KYC status, virtual accounts. Every request carries `Moonpay-Signature-V2` (and the legacy `Moonpay-Signature`).

There are two families:

- **Widget webhooks**: body `{ "type": "<event>", "data": { ... }, "externalCustomerId"?: "..." }`. Virtual account events are `{ "type": "<event>", "body": { ... } }` instead.
- **Platform webhooks**: the KYC event's body is `{ "id", "type", "timestamp", "data" }`; `id` matches the `webhook-id` header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `transaction_created` | A customer creates a Buy transaction in the widget | Record the order |
| `transaction_updated` | A Buy transaction's status or details change | Track status, credit the user on `completed` |
| `transaction_failed` | A Buy transaction fails | Show the failure reason, notify the user |
| `sell_transaction_created` | A customer creates a Sell transaction | Record the order, await deposit |
| `sell_transaction_updated` | A Sell transaction's status or details change | Track deposit and payout |
| `sell_transaction_failed` | A Sell transaction fails | Refund handling |
| `sell_transaction_requote_required` | The price moved before the deposit arrived | Prompt the user to accept a new quote |
| `identity_check_updated` | A customer's KYC status changes (widget) | Unlock limits |
| `customer.identity_status_updated` | A customer's KYC status transitions (Platform) | Sync KYC state |
| `virtual_account_status_updated` | A virtual account's status changes | Account lifecycle |
| `virtual_account_transaction_status_updated` | A virtual account transaction's status changes | Reconciliation |

MoonPay's docs disagree about Platform buy updates: the Platform overview points to the widget `transaction_updated` body, while the Platform OpenAPI file shows `eventTime` + `data` (with `sourceAmount`, `destinationAmount`, ...) and no `type`, and declares an `X-Signature` header. Check one test mode delivery before relying on either. The dashboard may list `swap_*` events that never fire for widget accounts.

## Delivery

- Respond 2xx within 5 seconds; non-2xx, timeout and connection errors are failures.
- Failed deliveries are retried with exponential backoff (1s, roughly doubling), up to 9 retries (10 attempts).
- Delivery is at-least-once and unordered: dedupe on `webhook-id` (Platform) or `type` + `data.id` + `data.updatedAt` (widget), and use `updatedAt` (Platform KYC event: `timestamp`) to pick the newer state.
- Webhooks come from fixed IPv4 addresses (`34.76.118.184`, `34.77.238.249`, `34.79.17.44`, `34.89.242.107`, `34.140.248.51`, `34.159.58.44`, `34.159.89.69`, `35.246.202.26`); no IPv6.

## Full Event Reference

- [Widget webhooks overview](https://dev.moonpay.com/api-reference/widget/webhooks/overview)
- [Platform webhooks overview](https://dev.moonpay.com/api-reference/platform/webhooks/overview)
