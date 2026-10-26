# 100ms Webhooks Overview

## What Are 100ms Webhooks?

100ms is a live video SDK and platform. Each workspace can have a webhook configuration; 100ms
sends a JSON `POST` to your URL for events in your rooms (peers, sessions, recordings, streaming,
transcription, SIP). Use them to build attendance, analytics or recording pipelines.

Requirements from the 100ms docs: the webhook **must implement `POST`**, parse JSON, and respond
`200 OK`. If you return anything else, 100ms retries three times (1 second after the original
attempt, 3 seconds after the first retry, 10 seconds after the second).

Webhooks are **not signed**. Authentication is a secret header you configure in the dashboard
(see [setup.md](setup.md) and [verification.md](verification.md)).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `session.open.success` | A session starts | Mark a room live |
| `session.close.success` | A session ends | Record duration, billing analytics |
| `peer.join.success` | A peer joins a room | Attendance tracking |
| `peer.leave.success` | A peer leaves a room | Close attendance records |
| `peer.join.failure` / `peer.leave.failure` / `room.end.failure` / `role.change.failure` | A join, leave, room end or role change fails | Alerting, debugging |
| `room.end.success` | A room ends | Finalize room state |
| `role.change.success` | A peer's role changes | Sync permissions |
| `recording.success` / `recording.failed` | An SFU recording ends | Fetch the recording |
| `track.recording.started.success`, `track.recording.success`, `track.recording.failure` | Track recording lifecycle | Per-track processing |
| `stream.recording.success`, `stream.recording.failure` | A stream recording ends | Fetch the stream recording |
| `beam.started.success`, `beam.stopped.success`, `beam.recording.success`, `beam.failure` | RTMP streaming / browser recording lifecycle | Live stream status |
| `hls.started.success`, `hls.stopped.success`, `hls.recording.success`, `hls.failure` | HLS streaming / recording lifecycle | Show a live badge, fetch the recording |
| `transcription.started.success`, `transcription.success`, `transcription.failure` | Transcription lifecycle | Fetch transcripts |
| `ingest.start.success`, `ingest.end.success`, `ingest.start.failure`, `ingest.failure` | RTMP ingestion lifecycle | Ingest monitoring |
| `sip.start.success`, `sip.start.failure`, `sip.end.success`, `sip.end.failure` | A SIP call connects, fails or ends | Call logs |

`type` follows `<object>.<action>.<outcome>`.

## Event Payload Structure

```json
{
  "version": "2.0",
  "id": "6c75de35-b778-4fb0-88ae-114c28dc285f",
  "account_id": "60b8e13a6eb86d8101b57354",
  "timestamp": "2021-08-08T07:04:15Z",
  "type": "peer.join.success",
  "data": {
    "joined_at": "2021-08-08T07:04:15.001380432Z",
    "peer_id": "83b869e1-9a4b-4037-84b2-913cf76e4392",
    "role": "host",
    "room_id": "60b8e13a6eb86d8101b57354",
    "room_name": "test room",
    "session_id": "610f81ee870dde099a249948",
    "template_id": "66112497abcd52312556c4gg",
    "user_id": "user.001",
    "user_name": "test user"
  }
}
```

Top-level fields: `version`, `id`, `app_id`, `account_id`, `template_id`, `timestamp` (UTC),
`type` and `data`. The keys inside `data` differ per event type. Dispatch on `type` and dedupe on
`id`, since retries redeliver the same event.

## Full Event Reference

See the [100ms webhook overview](https://www.100ms.live/docs/server-side/v2/how-to-guides/configure-webhooks/overview)
and [webhook events](https://www.100ms.live/docs/server-side/v2/how-to-guides/configure-webhooks/webhook).
