# Glean Webhooks Overview

## What Are Glean Webhooks?

Glean **Triggers** subscribe an application to content events in Glean (a review
requested from you, a new call you took part in, the half hour before a meeting
starts) and deliver each match to your endpoint as a signed HTTP POST. Delivery
follows the [Standard Webhooks](https://www.standardwebhooks.com/) specification.

Triggers are created through the Platform API (`POST /api/triggers`) from
**presets**: curated event definitions, one per datasource, each declaring the
inputs it accepts. The Triggers API is experimental and requires the
`x-glean-include-experimental: true` header.

## Event Types

Presets are per-datasource and their ids are **per deployment**: discover them
with `GET /api/trigger-presets` instead of hardcoding. The delivery body itself
has two variants, discriminated by `event_type` in the `triggerEvent` callback of
Glean's [Platform API OpenAPI spec](https://github.com/gleanwork/open-api/blob/main/final_specs/platform.yaml):

| `event_type` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `DOCUMENT_CHANGE` | A document matching the trigger changes; `reason` says why (e.g. `REVIEW_REQUESTED`) | Review queues, ticket and message alerts |
| `CONTENT_SCHEDULE` | A schedule preset fires, e.g. a calendar event starts in `time_offset_seconds` | Meeting prep, reminders |

Keep a default branch for `event_type` values you do not handle.

## Event Payload Structure

The spec's example for a document change:

```json
{
  "version": "1",
  "trigger_id": "trigger_test_123",
  "event_type": "DOCUMENT_CHANGE",
  "datasource": "GITHUB",
  "reason": "REVIEW_REQUESTED",
  "doc_type": "pull",
  "doc_id": "GITHUB_pull_123",
  "view_url": "https://github.com/acme/payments-api/pull/123",
  "title": "Add retry backoff to the crawler",
  "event_time": "2025-04-23T11:00:00Z"
}
```

A `CONTENT_SCHEDULE` delivery has the same fields plus `time_offset_seconds`
(for example `1800`). Email and Slack document changes can also carry `content`,
`content_truncated` and `facets`.

## Headers

| Header | Meaning |
|--------|---------|
| `webhook-id` | Stable across retries; use as the idempotency key |
| `webhook-timestamp` | Unix seconds when signed |
| `webhook-signature` | Space-delimited `v1,<base64>` entries |
| `Authorization` | `Bearer <secret>` only if the trigger was created with `delivery.auth` of type `BEARER` |

## Delivery Behaviour

- At-least-once: the same event can arrive more than once with the same `webhook-id`.
- Glean retries connection failures, timeouts, `408`, `429` and `5xx`.
- Any other non-2xx response, including redirects, is terminal: the event is dropped. Return a 2xx as soon as you have accepted the event and do slow work afterwards.
- Deliveries are filtered per event against the subscribing user's document permissions.
- Use an `https://` webhook URL; the signature proves origin and integrity, not confidentiality.

## Full Reference

- [Triggers overview](https://developers.glean.com/guides/triggers/overview)
- [Webhook delivery](https://developers.glean.com/guides/triggers/webhook-delivery)
