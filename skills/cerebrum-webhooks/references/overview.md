# Cerebrum Webhooks Overview

## What Are Cerebrum Webhooks?

[Cerebrum](https://www.cerebrum.com) is a background-check and identity-verification API (screening orders, vID invites, monitoring). When something changes, Cerebrum POSTs a compact JSON notification to the `postbackWebhookUrl` you set when you created the order or vID invite. Global webhook destinations and CRA delegation can add other targets. Delivery, retries, signing and the replay portal are Svix's, so the request is a standard Svix delivery with `svix-id`, `svix-timestamp` and `svix-signature` headers. Cerebrum does not send a challenge or handshake.

See Cerebrum's [webhook implementation guide](https://docs.cerebrum.com/docs/webhook-guides) and [validation page](https://docs.cerebrum.com/docs/validation).

## Event Types

Cerebrum documents 13 event types in the top-level `event` field. The [Event Types](https://docs.cerebrum.com/docs/event-types) catalog and the payload JSON Schema list the same values.

| Event | `idType` | When it is sent |
|-------|----------|-----------------|
| `ORDER_STATUS_CHANGE` | `order` | The order's stored status changes |
| `ORDER_SCORE_CHANGE` | `order` | The order's score is updated (can wait for the report PDF in the ID-verification flow) |
| `ORDER_CUSTOM_SCORE_CHANGE` | `order` | The order's custom score changes |
| `ORDER_DISPUTE_RESOLVED` | `order` | A disputed order moves to complete, just before its `ORDER_STATUS_CHANGE` |
| `ORDER_ERROR` | `order` | A county search fails to dispatch (opt-in) |
| `VOUCHER_REDEEMED` | `invite` | An order is created from an invite; `id` is the invite ID |
| `VOUCHER_ACCEPTED` | `invite` | The applicant accepts the invite (opt-in) |
| `VOUCHER_STARTED` | `invite` | The applicant starts verification (opt-in) |
| `VOUCHER_CANCELED` | `invite` | The invite is canceled (opt-in) |
| `VOUCHER_EXPIRED` | `invite` | The invite expires before it is completed or canceled |
| `VOUCHER_OPTED_OUT` | `invite` | The applicant opts out |
| `BEAM_INPUT_CREATED` | `beamInput` | Accepted by the simulation route; Cerebrum found no production emitter |
| `MONITORING_REPORT_GENERATED` | `report` | A monitoring report PDF is attached |

The four opt-in events are off unless enabled under `metadata.webhooks.events` on the package or organization, keyed by internal names (`order.error`, `voucher.accepted`, `voucher.started`, `voucher.canceled`). The delta page's `order.updated` is also an internal name, for the four order-update events; internal names never appear in the payload.

## Event Payload Structure

The payload JSON Schema is `additionalProperties: false`:

| Field | Description |
|-------|-------------|
| `id` | ID of the order, invite, Beam input or monitoring report |
| `idType` | `order`, `invite`, `beamInput` or `report` |
| `organizationId` | Organization the event belongs to (optional only for older payloads) |
| `additionalMetadata` | Metadata attached at creation, or event data such as `ORDER_ERROR`'s stage and search IDs |
| `event` | Event type, **required** |
| `eventDate` | When the event occurred (ISO 8601) |
| `svixAppId` | Svix application ID, not a secret |
| `metadata` | Only `metadata.delta`, a JSON Patch-style list with `before` and `after`, on the four order-update events when a pre-update snapshot existed |

Cerebrum's synthetic example for `ORDER_STATUS_CHANGE`:

```json
{
  "id": "0bb0f6f8-459f-482a-952e-7caf029517f6",
  "idType": "order",
  "organizationId": "a3f1c9d2-6b4e-4c8a-b7e5-2d9f0e1a3c47",
  "additionalMetadata": {
    "clientReferenceId": "APP-1042"
  },
  "metadata": {
    "delta": [
      {
        "op": "replace",
        "path": "/status",
        "before": "PENDING",
        "after": "COMPLETE"
      }
    ]
  },
  "event": "ORDER_STATUS_CHANGE",
  "eventDate": "2026-11-19T15:07:00.000Z",
  "svixAppId": "app_2z7K9synthetic000000000001"
}
```

Fetch the full resource with `GET /v1/orders/{id}`, `GET /v1/vid/invites/{id}` or `GET /v1/monitoring/reports/{id}`.

## Delivery and Retries

- Any `2xx` succeeds; 3xx, 4xx, 5xx and timeouts fail. Cerebrum says the response deadline isn't confirmed and recommends acknowledging in under 10 seconds.
- Retry schedule: immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h, then the message is marked failed for that endpoint. The Svix portal can resend, recover and replay.
- A resent message keeps its `svix-id`. Dedupe on it, not on `id` and `event`.
- Cerebrum promises no ordering or exactly-once processing.
