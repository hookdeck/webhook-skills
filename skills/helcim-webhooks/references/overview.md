# Helcim Webhooks Overview

## What Are Helcim Webhooks?

[Helcim](https://www.helcim.com) is a Canadian and US card payment processor. When a payment goes through any Helcim payment tool, Helcim sends an HTTP POST with a JSON body to the Deliver URL you configured, so your system learns about the payment immediately instead of polling. It fires for approved and declined card transactions, and for payments cancelled on a payment device in API mode. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with your account's `verifierToken`.

An event is only sent when its toggle is on at **All Tools > Integrations > Webhooks**.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `cardTransaction` | A card transaction occurs on the merchant account (approved or declined) | Update an order's status, trigger a receipt, complete a checkout flow |
| `terminalCancel` | A payment is cancelled on the device before processing (device in API mode) | Release a held order, tell the cashier or customer the payment was cancelled |

Helcim documents only these two events (the list may not be exhaustive). Ignore types you don't recognise.

## Event Payload Structure

The event name is the top-level `type`.

`cardTransaction` is a thin notification with only the card transaction ID:

```json
{
  "id": "25764674",
  "type": "cardTransaction"
}
```

It does not include the amount, card type or approval status. Pass `id` to [Get Card Transaction by ID](https://devdocs.helcim.com/reference/getcardtransaction) to fetch the full transaction record.

`terminalCancel` carries the cancelled payment under `data`:

```json
{
  "data": {
    "cancelledAt": "2026-01-14T18:38:18Z",
    "currency": "CAD",
    "customerCode": "",
    "deviceCode": "NBL7",
    "invoiceNumber": "",
    "transactionAmount": 1
  },
  "type": "terminalCancel"
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event type. This is what handlers switch on |
| `id` | `cardTransaction` only: the card transaction ID |
| `data.cancelledAt` | `terminalCancel` only: when the payment was cancelled (ISO 8601) |
| `data.currency` / `data.transactionAmount` | Currency and amount of the cancelled payment |
| `data.deviceCode` | The payment device the cancellation happened on |
| `data.customerCode` / `data.invoiceNumber` | Customer and invoice, empty when not set |

There is no event id in the body. The `webhook-id` header is unique per message and stable across retries, so it is the idempotency key.

## Retry Schedule

If your endpoint doesn't return a `2xx` (200-299), Helcim retries until it does. Each period starts when the previous attempt fails:

| Attempt | Delay after the previous failure |
|---------|----------------------------------|
| 1 | Immediately |
| 2 | 5 seconds |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 5 hours |
| 7 | 10 hours |
| 8 | 10 hours |

Helcim's own example: an event that fails three times before succeeding arrives about 35 minutes and 5 seconds after the first attempt.

## Full Event Reference

See [Helcim's webhook documentation](https://devdocs.helcim.com/docs/webhooks).
