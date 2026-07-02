# Zoom Webhooks Overview

## What Are Zoom Webhooks?

Zoom webhooks notify your application in real time when events happen on your
Zoom account — meetings starting and ending, participants joining or leaving,
cloud recordings completing, and more. Instead of polling the Zoom API, you
register an event notification endpoint on a Zoom App (in the
[Zoom App Marketplace](https://marketplace.zoom.us/)) and Zoom sends an
HTTP `POST` to your URL each time a subscribed event fires.

Every request is signed with HMAC-SHA256 so you can verify it genuinely came
from Zoom before acting on it. See [verification.md](verification.md).

## The URL Validation Handshake

Before Zoom delivers real events, and whenever you save the endpoint URL, Zoom
sends a one-time `endpoint.url_validation` event. Your endpoint must respond
within 3 seconds with a JSON body proving you hold the Secret Token:

```json
{
  "plainToken": "<the plainToken Zoom sent>",
  "encryptedToken": "<HMAC-SHA256(plainToken, secretToken) as hex>"
}
```

If your endpoint does not answer this challenge correctly, Zoom will not enable
the subscription. Handle it in the same route as your event handling — see the
examples.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `endpoint.url_validation` | Zoom validates your endpoint URL (one-time handshake) | Must be answered to enable the subscription |
| `meeting.started` | A meeting starts | Start recording bots, notify teams, begin tracking |
| `meeting.ended` | A meeting ends | Trigger follow-ups, calculate duration, close sessions |
| `meeting.participant_joined` | A participant joins a meeting | Attendance tracking, greetings, presence updates |
| `meeting.participant_left` | A participant leaves a meeting | Attendance tracking, drop-off analytics |
| `recording.completed` | A cloud recording finishes processing | Download recordings, transcribe, publish, notify |

## Event Payload Structure

Zoom event payloads share a common envelope:

```json
{
  "event": "meeting.started",
  "event_ts": 1658940994397,
  "payload": {
    "account_id": "AbCdEfGh",
    "object": {
      "id": "123456789",
      "uuid": "abcd1234==",
      "host_id": "xyz987",
      "topic": "My Meeting",
      "type": 2,
      "start_time": "2026-07-02T10:00:00Z",
      "timezone": "America/New_York"
    }
  }
}
```

- `event` — the event type string (e.g. `meeting.started`).
- `event_ts` — when the event occurred (milliseconds).
- `payload.account_id` — the Zoom account the event belongs to.
- `payload.object` — the event-specific object (a meeting, participant, or recording).

The `endpoint.url_validation` payload is different — it contains
`payload.plainToken` instead of `payload.object`.

## Full Event Reference

For the complete list of events, see
[Zoom's webhook documentation](https://developers.zoom.us/docs/api/webhooks/).
