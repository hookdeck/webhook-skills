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
| `Paypercut-Delivery-Id` | Unique ID of the event's delivery to this endpoint; retries of the same delivery send the same ID (use it to dedupe) |
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

Every event has a complete example on Paypercut's [Types of events](https://docs.paypercut.io/api-reference/tag/events/types) page. The top-level fields are `id`, `account`, `api_version`, `type`, `created` (RFC 3339), `livemode`, `pending_webhooks`, `request` and `data`. `type` is the catalogue identifier, `data.object` is a snapshot of the resource when the event occurred, and `data.previous_attributes` holds old values of changed fields when supplied. `account` names the account that produced the event, which matters for `connect` deliveries. The `data.object` shape depends on the resource and, for Checkout Sessions and Payment Intents, on `api_version`. Dispatch on `type`, and log event types you don't handle.

An explicit endpoint test from the Merchant Dashboard arrives as `webhook_endpoint.test` with an empty `data.object`. It can't be subscribed to; acknowledge it with `200`.

## Delivery

A `2xx` means processed, and a `500` is retried (the schedule is undocumented, and retries eventually end). Return `2xx` only after processing. Events can be delivered more than once: Paypercut advises deduping on `Paypercut-Delivery-Id`, which stays the same across retries of a delivery. `GET /v1/events?delivery_success=false` lists events from the last 30 days with a delivery that hasn't succeeded.

## Full Event Reference

See the [Webhook event catalogue](https://docs.paypercut.io/docs/introduction/start-developing/webhook-events/index.md) and the [Webhooks guide](https://docs.paypercut.io/docs/introduction/start-developing/webhooks).
