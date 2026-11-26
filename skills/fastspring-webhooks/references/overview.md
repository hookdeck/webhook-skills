# FastSpring Webhooks Overview

## What Are FastSpring Webhooks?

FastSpring is an ecommerce and subscription-management platform. It uses webhooks
to notify your application when events happen in your store — a completed order, an
activated subscription, a successful or failed recurring charge, a cancellation, or
a refund. Instead of polling the API, FastSpring sends an HTTPS POST to your
configured endpoint whenever a subscribed event occurs.

## Batched Event Payloads

Unlike many providers, each FastSpring POST **batches multiple events** in a single
request. The body is a JSON object with an `events` array:

This is the request example from FastSpring's
[Webhooks Overview](https://developer.fastspring.com/reference/webhooks-overview); each
`data` object is printed on the event's own reference page:

```jsonc
{
  "events": [
    {
      "id": "jazYJQw5RSWVR474tU2Obw",
      "live": true,
      "processed": false,
      "type": "subscription.activated",
      "created": 1426560444800,
      "data": {
        // See individual event reference pages for "data" contents
      }
    },
    {
      "id": "VOe5PQx-T4S6t8yS_ziYeA",
      "live": true,
      "processed": false,
      "type": "subscription.deactivated",
      "created": 1426560444900,
      "data": {
        // See individual event reference pages for "data" contents
      }
    }
  ]
}
```

Verify the signature **once** against the whole raw body, then iterate `events` and
dispatch on each `event.type`.

### Event Fields

| Field | Description |
|-------|-------------|
| `id` | Unique event identifier. Automatic retries reuse the same id (dedupe on it); manual retries get a new id |
| `type` | Event name (e.g., `order.completed`) |
| `live` | `true` for production, `false` for test events |
| `processed` | Delivery/processing status flag |
| `created` | Timestamp in milliseconds |
| `data` | Event-specific object. Only the related ID by default; the full account, order, product and subscription objects when Webhook Expansion is on |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.completed` | An order is successfully completed | Provision access, fulfill, send receipt |
| `order.failed` | An order fails | Alert, retry payment flow |
| `order.canceled` | An order is canceled | Revoke provisional access |
| `subscription.activated` | A new subscription is activated | Grant access, start entitlement |
| `subscription.charge.completed` | A recurring charge succeeds | Extend entitlement, record revenue |
| `subscription.charge.failed` | A recurring charge fails | Dunning, notify customer |
| `subscription.updated` | A subscription is updated | Sync plan/quantity changes |
| `subscription.canceled` | A subscription is canceled | Schedule end-of-term downgrade |
| `subscription.deactivated` | A subscription is deactivated | Revoke access |
| `return.created` | A return/refund is created | Reverse entitlement, adjust revenue |

Additional events include `account.created`, `account.updated`, `chargeback.created`,
`fulfillment.failed`, subscription co-term (`subscription.group.*`), quote
(`quote.*`), payout (`payoutEntry.created`), and mailing-list events.

## Headers

| Header | Description |
|--------|-------------|
| `X-FS-Signature` | Base64-encoded HMAC-SHA256 of the raw body (present only when an HMAC secret is configured) |

## Delivery & Retries

- FastSpring recommends **HTTPS**, on port 443 or one of 3443, 8282, 9191, 9000 or 9999.
- FastSpring retries any event not marked processed for up to 7 days (at most 12 retries). A `200` marks every event in the POST processed; a `202` marks only the event IDs you list in the response body, one per line; any other status is a failure.
- After 7 days an event is marked permanently failed; fetch missed events with `GET /events/unprocessed`.
- Automatic retries reuse the same event `id` — dedupe on `id` to stay idempotent.
- Optional: allowlist FastSpring's source IP `107.23.30.83`.

## Full Event Reference

For the complete list of events and payload schemas, see the
[FastSpring Webhooks documentation](https://developer.fastspring.com/reference/webhooks-overview).
