# Cerebrum Webhooks Overview

## What Are Cerebrum Webhooks?

[Cerebrum](https://www.cerebrum.com) is a background-check and identity-verification API (orders, vID vouchers, monitoring). When something changes, Cerebrum POSTs a JSON notification to the `postbackWebhookUrl` configured for your integration. Delivery, retries, signing and the replay portal are Svix's, so the request is a standard Svix delivery with `svix-id`, `svix-timestamp` and `svix-signature` headers. Cerebrum does not send a challenge or handshake.

See Cerebrum's [webhook guide](https://docs.cerebrum.com/docs/webhook-guides) and [validation page](https://docs.cerebrum.com/docs/validation).

## Common Event Types

Cerebrum documents 9 event types in the top-level `event` field. The list may not be exhaustive.

| Event | Group | What the name indicates |
|-------|-------|-------------------------|
| `ORDER_STATUS_CHANGE` | Order | An order's status changed |
| `ORDER_SCORE_CHANGE` | Order | An order's score changed |
| `ORDER_CUSTOM_SCORE_CHANGE` | Order | An order's custom score changed |
| `ORDER_DISPUTE_RESOLVED` | Order | A dispute on an order was resolved |
| `VOUCHER_STARTED` | Voucher (vID) | A voucher was started |
| `VOUCHER_REDEEMED` | Voucher (vID) | A voucher was redeemed |
| `VOUCHER_EXPIRED` | Voucher (vID) | A voucher expired |
| `MONITORING_REPORT_GENERATED` | Monitoring | A monitoring report was generated |
| `BEAM_INPUT_CREATED` | Beam | A Beam input was created |

The "what the name indicates" column is read from the event names; Cerebrum's event list gives no longer description here, so check Cerebrum's docs for exact trigger conditions.

Cerebrum's delta page speaks of `order.updated` events, a name that appears in neither list. Treat the `event` field as the source of truth and acknowledge values you don't recognise.

## Event Payload Structure

The payload JSON Schema is `additionalProperties: false` with these properties:

| Field | Description |
|-------|-------------|
| `id` | ID of the object the event concerns |
| `idType` | What kind of ID `id` is |
| `additionalMetadata` | Additional metadata |
| `event` | Event type, **required** (one of the values above) |
| `eventDate` | When the event occurred |
| `svixAppId` | Svix application ID |
| `metadata` | Event details; `metadata.delta` is a JSON-Patch-style change list on some order updates |

No example body is published, so no sample is shown here. Look at a real delivery in the Svix Portal to see the values.

## Delivery and Retries

- Any `2xx` within 30 seconds succeeds; anything else (3xx included) or a timeout is retried.
- Retry schedule: immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h, then the message is dropped.
- Every retry of a message has the same `svix-id`. Dedupe on it.

## Full Event Reference

For the complete list of events, see [Cerebrum's webhook documentation](https://docs.cerebrum.com/docs/webhook-guides).
