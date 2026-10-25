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
with `GET /api/trigger-presets` instead of hardcoding. Glean documents no fixed
list of webhook event strings, so dispatch on the payload fields instead.

| `event_type` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `CONTENT_SCHEDULE` | A schedule preset fires, e.g. a calendar event starts in `time_offset_seconds` | Meeting prep, reminders |

Other presets deliver document-change events; handle unknown `event_type` values
in a default branch and read `reason`, `title` and `view_url` for context.

## Event Payload Structure

Illustrative only: Glean's public docs don't publish a delivery body schema, and the
customer-meeting-prep cookbook page doesn't show one. The JSON below is the test fixture
(`fixtures/delivery.json`) from that recipe's source in the `gleanwork/glean-cookbook` repo, so
confirm the field names against a real delivery before relying on them:

```json
{
  "version": "1",
  "trigger_id": "spec-7d2f1a8b3c9e0546",
  "trigger_name": "b4c8e2a60d1f47539a7c3e5b1d8f0264",
  "datasource": "GOOGLECALENDAR",
  "doc_type": "event",
  "event_type": "CONTENT_SCHEDULE",
  "reason": "",
  "doc_id": "GOOGLECALENDAR_Event_A1B2C3D4E5F60718293A4B5C6D7E8F90",
  "title": "Platform weekly — metrics review",
  "view_url": "https://www.google.com/calendar/event?eid=...",
  "event_time": "2026-08-25T18:30:00Z",
  "time_offset_seconds": 1800
}
```

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
