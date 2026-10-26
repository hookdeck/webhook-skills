# Paypercut Webhooks Overview

## What Are Paypercut Webhooks?

Paypercut (paypercut.io) sends a signed JSON webhook to your endpoint when something happens on a payment, checkout, connected account, payout, invoice or identity verification. Create endpoints in the [Merchant Dashboard](https://dashboard.paypercut.io/developers/webhooks) or with the Webhooks API. Each endpoint has:

- `enabled_events`: the exact identifiers to receive (wildcards such as `*` are not accepted)
- `api_version`: `v2` (recommended) or `v1` (legacy Checkout Session and Payment Intent payload shapes, used when omitted). It can't be changed after creation.
- `connect`: `true` also delivers events from accounts connected to your platform; the top-level `account` field names the account

## Headers

| Header | Description |
|--------|-------------|
| `Paypercut-Signature` | `t=<unix seconds>,v1=<hex>` signature used to verify authenticity |
| `Paypercut-Delivery-Id` | Unique ID of the delivery attempt (use it to dedupe) |
| `Paypercut-Event-Id` | Unique ID of the webhook event |
| `Content-Type` | Always `application/json` |

No header names the event type: read it from the body.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `checkout_session.completed` | A Checkout Session has been completed | Fulfil an order |
| `payment.succeeded` | A payment has succeeded | Mark an order as paid |
| `payment.failed` | A payment has failed | Notify the customer, retry |
| `payment_intent.authorized` | A Payment Intent has been authorized | Capture when ready |
| `payment_intent.captured` | A Payment Intent has been captured | Record captured funds |
| `payout.paid` | A payout has been paid | Reconcile settlements |
| `payout.failed` | A payout has failed | Alert finance |
| `account.updated` | An account has been updated | Refresh a connected account's status |
| `invoice.paid` | An invoice has been paid | Extend a subscription |
| `invoice.payment_failed` | Payment for an invoice has failed | Dunning |
| `identity.verification_session.verified` | An identity verification session has been verified | Unlock a verified user |

## All Documented Events (29)

- Checkout: `checkout_session.completed`
- Payment: `payment.succeeded`, `payment.failed`
- Payment Intent: `payment_intent.authorized`, `payment_intent.captured`
- Account: `account.created`, `account.updated`, `account.capability.requested`, `account.capability.updated`, `account.external_account.created`, `account.external_account.updated`
- Person: `person.created`, `person.updated`, `person.deleted`
- Invoice: `invoice.paid`, `invoice.payment_failed`
- Tax Invoice: `tax_invoice.finalized`, `tax_invoice.available`
- Payout: `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`
- Identity Verification: `identity.verification_session.created`, `.processing`, `.requires_input`, `.verified`, `.canceled`, `.redacted` (each prefixed `identity.verification_session`)

## Event Payload Structure

Paypercut documents no delivered sample body. Its payload-validation sample requires a string `type` and a `data` object, and the catalogue adds a top-level `account` for connected-account events. Dispatch on `type`, and log event types you don't handle.

```json
{ "type": "payment.succeeded", "data": { "id": "..." } }
```

(Illustrative: the `data` shape depends on the resource and `api_version`.)

## Delivery

A `2xx` means processed, and a `500` is retried (the schedule is undocumented). Return `2xx` only after processing. Paypercut advises deduping on `Paypercut-Delivery-Id`.

## Full Event Reference

See the [Webhook event catalogue](https://docs.paypercut.io/docs/introduction/start-developing/webhook-events/index.md) and the [Webhooks guide](https://docs.paypercut.io/docs/introduction/start-developing/webhooks).
