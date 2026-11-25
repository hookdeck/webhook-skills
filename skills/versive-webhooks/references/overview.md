# Versive Webhooks Overview

## What Are Versive Webhooks?

[Versive](https://getversive.com/) is an AI-moderated user-research platform. It can send an
HTTPS `POST` with a signed JSON body when a participant completes an interview or is screened out.
Webhooks are an organization-level integration that owners and admins set up in **Organization →
Connectors → Webhooks**; creating and rotating destinations is not part of the public `v1` REST API.
Deliveries go through Svix and follow Standard Webhooks with the `svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx`, returned only after your service has accepted the event; anything else is retried (no schedule is documented) |
| Delivery | At-least-once; `svix-id` is stable across retries |
| Challenge | None |

## Event Payload Structure

The body has the event type at the top level, beside the interview and its study. `interview.completed`:

```json
{
  "event_type": "interview.completed",
  "interview": {
    "id": "interview-uuid",
    "status": "closed",
    "vid": "participant-facing-id",
    "used_fallback_transcription": false
  },
  "study": {
    "id": "study-uuid",
    "title": "Onboarding research"
  }
}
```

`interview.screened_out` is a slim body with identifiers, status, timestamps and the interview
metadata. It never includes the transcript, conversation or recording:

```json
{
  "event_type": "interview.screened_out",
  "version": 1,
  "interview": {
    "id": "interview-uuid",
    "status": "screened_out",
    "vid": "participant-facing-id",
    "is_mock": false,
    "created_at": "2026-10-20T10:00:00.000Z",
    "completed_at": "2026-10-20T10:05:00.000Z",
    "metadata": {}
  },
  "study": {
    "id": "study-uuid",
    "title": "Onboarding research"
  }
}
```

- There is no event id in the body: use the `svix-id` header to deduplicate.
- No header carries the event type: read `event_type` from the body.
- The `interview` object can also include transcript, recording, timing and metadata fields.
  Treat the whole request as sensitive research data, log only the fields you need, and don't
  expose the destination publicly.
- `interview.used_fallback_transcription` is `true` if any recorded answer was transcribed by a
  fallback model rather than one of Versive's primary models. A failed attempt that then succeeds
  on another primary model doesn't set it, and re-transcribing later doesn't clear it. Real-time
  voice interviews always report `false`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `interview.completed` | A participant completes an interview | Pull the transcript into your research repository, notify a channel, kick off analysis |
| `interview.screened_out` | A participant is screened out of an interview | Track screener drop-off, update a participant record |

Two events are documented and the list may not be exhaustive. The examples handle both and
acknowledge anything else with `200`, so new event types don't trigger retries. An endpoint with no
event filter receives every event type. Versive's [versioning policy](https://docs.getversive.com/api-reference/versioning.md)
covers changes to available events.

## Delivery Notes

- **Deduplicate on `svix-id`.** A delivery may be retried, even after your handler has already
  processed it.
- Return `2xx` only after your service has accepted the event, and queue slow work instead of
  doing it in the request handler.
- The webhooks portal shows delivery logs and can replay messages. Turning webhooks off stops
  deliveries, and events from that period are not sent later.

## Full Event Reference

See Versive's [webhook documentation](https://docs.getversive.com/api-reference/webhooks).
