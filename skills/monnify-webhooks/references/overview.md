# Monnify Webhooks Overview

## What Monnify Sends

Monnify sends a `POST` with a compact JSON body to the webhook URL configured for the event, with the signature in `monnify-signature` (live environment only).

## Payload

| Field | Meaning |
|---|---|
| `eventType` | The event, for example `SUCCESSFUL_TRANSACTION` |
| `eventData` | The event's data. Its shape depends on `eventType` |

For `SUCCESSFUL_TRANSACTION`, `eventData` includes `product` (`reference`, `type`), `transactionReference`, `paymentReference`, `paidOn`, `paymentDescription`, `metaData`, `destinationAccountInformation`, `paymentSourceInformation`, `amountPaid`, `totalPayable`, `offlineProductInformation`, `cardDetails`, `paymentMethod`, `currency`, `settlementAmount`, `paymentStatus` and `customer`.

## Event Types

Monnify's docs group webhook events by product: collections (`SUCCESSFUL_TRANSACTION`), disbursements, refunds and settlements. Check the docs for the exact names before you switch on them.

## Delivery

- Respond quickly with a 2xx, then process.
- Make handlers idempotent: dedupe on `transactionReference` (or the event's own reference for non-transaction events).
- For payments, query the transaction from the Monnify API before fulfilling a high-value order. A signed webhook proves it came from Monnify, but the API is the source of truth for status.
- An IP allowlist can add defence in depth, but treat the signature as the primary control.
