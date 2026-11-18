# LiveKit Webhooks Overview

## What Are LiveKit Webhooks?

LiveKit (livekit.io) is the open-source WebRTC platform: an SFU that routes realtime audio,
video and data, plus the Agents framework, SIP telephony and Egress/Ingress. Rooms contain
participants, which publish tracks. LiveKit POSTs a webhook when a room, participant,
track, egress or ingress changes state.

Both deployment flavours send the identical request:

- **LiveKit Cloud**: webhooks created under **Settings → Webhooks**, signed with the API key
  you pick as the **Signing API key**.
- **Self-hosted `livekit-server`**: the `webhook:` block in `config.yaml`, signed with
  `webhook.api_key`.

Each request is a `POST` with `Content-Type: application/webhook+json`, an `Authorization`
header holding a signed JWT, and `User-Agent: LiveKit` (unauthenticated; never gate on
it). See [verification.md](verification.md).

### Webhooks are not SDK events

LiveKit's docs describe webhooks and client SDK events on the same page. They are
different things:

| | Webhooks | Client SDK events |
|---|---|---|
| Naming | snake_case: `participant_joined` | PascalCase: `ParticipantConnected` |
| Delivery | HTTP POST to your server | In-process callback (`RoomEvent`, `ParticipantEvent`) |
| Covered here | Yes | No |

If an event name is PascalCase, it is not a webhook and no server will ever receive it.

## Event Types

The webhooks documentation table lists twelve events. The name is in the top-level
`event` field.

| Event | Triggered When | Payload objects | Common Use Cases |
|-------|----------------|-----------------|------------------|
| `room_started` | The first participant joins an empty room | `room` | Start billing/session tracking |
| `room_finished` | The room closes: `room.close()`, or the last participant left and the empty timeout expired | `room` | Close sessions, kick off post-processing |
| `participant_joined` | The participant's media connection is established and their state becomes `ACTIVE` | `room`, `participant` | Presence, attendance |
| `participant_left` | The participant left and all cleanup completed | `room`, `participant` | Presence, usage metering |
| `participant_connection_aborted` | The connection aborted unexpectedly; can fire after the signal connection succeeded if the media connection fails | `room`, `participant` | Connectivity alerting |
| `track_published` | A participant published a track | `room`*, `participant`*, `track` | Start per-track egress, moderation |
| `track_unpublished` | A participant unpublished a track | `room`*, `participant`*, `track` | Stop per-track processing |
| `egress_started` | A recording/stream (egress) started | `egressInfo` | Track recordings |
| `egress_updated` | An egress was updated (e.g. file size changed) | `egressInfo` | Progress reporting |
| `egress_ended` | An egress ended | `egressInfo` | Fetch the file from `fileResults[]`, handle `error` |
| `ingress_started` | An ingress (external RTMP/WHIP/URL stream) started | `ingressInfo` | Go-live notifications |
| `ingress_ended` | An ingress ended | `ingressInfo` | End-of-stream handling |

\* On `track_published` and `track_unpublished`, LiveKit's docs say "The `room` and
`participant` objects in the payload for this event only include SID, name, and
identity." Do not read `participant.state` or `room.numParticipants` on track events.

There is no webhook for the signal-connection phase: `participant_joined` fires later than
the SDK's `ParticipantConnected`.

### Protocol-only events: `agent_job_*`

`agent_job_pending`, `agent_job_started` and `agent_job_ended` are present in LiveKit's
protocol definition (livekit/protocol `livekit_webhook.proto` comments them on the `event`
field and `webhook/consts.go` declares them, with a `job` object in the payload), but they
are **not** in the webhooks documentation table and are not selectable in the Cloud
test-event picker as of 2026-11-18. Their payload shape and Cloud delivery are not
documented. Recognise the names and return 200 for them (and for any other unknown name);
an exhaustive switch with a throwing default would break if they arrive.

### Egress-scoped webhook URLs

An Egress request can carry its own `webhooks` list (`WebhookConfig`: `url`, `signing_key`),
adding webhook URLs for that egress only. That explains egress events arriving at a URL not listed in project settings.

## Event Payload Structure

The body is a protojson-serialised `WebhookEvent` (livekit/protocol
`livekit_webhook.proto`):

```json
{
  "event": "participant_joined",
  "id": "EV_3xV9FhQm7kTa",
  "createdAt": "1700000010",
  "room": {
    "sid": "RM_hycBMAjmt6Ub",
    "name": "demo-room",
    "emptyTimeout": 300,
    "creationTime": "1700000000",
    "numParticipants": 1
  },
  "participant": {
    "sid": "PA_39FqBjKZ2xyC",
    "identity": "alice",
    "name": "Alice",
    "state": "ACTIVE",
    "joinedAt": "1700000010"
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `event` | string | Event name (snake_case) |
| `id` | string | Unique event UUID: **the idempotency key**. A retry carries the same `id` |
| `createdAt` | int64 seconds | Serialised as a JSON **string**; parse with `Number()` / `int()` |
| `room` | Room | On `room_*`, `participant_*`, `track_*` |
| `participant` | ParticipantInfo | On `participant_*`, `track_*` |
| `track` | TrackInfo | On `track_*` |
| `egressInfo` | EgressInfo | On `egress_*` |
| `ingressInfo` | IngressInfo | On `ingress_*` |
| `job` | Job | On `agent_job_*` (protocol only, see above) |
| `numDropped` | int32 | Marked deprecated in the proto but still set by the sender: events dropped since the last delivery because the send queue overflowed |
| `roomEndReason` | enum | Present in the protocol definition for `room_finished`; not described in the docs table |

### Protojson rules that change how you read the payload

- **Zero/default fields are omitted.** `muted: false`, `numParticipants: 0`, an empty
  `metadata`, and `numDropped: 0` do not appear at all. Read every field defensively
  (`event.room?.metadata ?? ''`, `track.get("muted", False)`). This includes **enum zero
  values**: an absent `track.type` means `AUDIO`, `track.source` `UNKNOWN`,
  `participant.state` `JOINING`, `egressInfo.status` `EGRESS_STARTING`.
- **int64 is a JSON string**: `createdAt`, `creationTime`, `joinedAt`, `startedAt`,
  `endedAt`, `updatedAt` arrive as `"1700000000"`. Some fixtures in the wild show numbers;
  accept both.
- **Enums are names**: `"ACTIVE"`, `"VIDEO"`, `"CAMERA"`, `"EGRESS_COMPLETE"`.
- **Keys are lowerCamelCase**: `egressInfo`, `mimeType`, `joinedAt`, `egressId`, `roomName`.

### Object fields

- **Room**: `sid`, `name`, `emptyTimeout`, `departureTimeout`, `maxParticipants`,
  `creationTime`, `turnPassword`, `metadata`, `numParticipants`, `activeRecording`
- **ParticipantInfo**: `sid`, `identity`, `name`, `state` (`JOINING` | `JOINED` | `ACTIVE`
  | `DISCONNECTED`), `tracks[]`, `metadata`, `joinedAt`, `permission`, `isPublisher`
- **TrackInfo**: `sid`, `type`, `source`, `name`, `mimeType`, `muted`, `width`, `height`,
  `simulcast`, `disableDtx`, `layers[]`
- **EgressInfo**: `egressId`, `roomId`, `roomName`, `sourceType`, `status`, `startedAt`,
  `endedAt`, `updatedAt`, `details`, `error`, `errorCode`, `request`, `streamResults[]`,
  `fileResults[]`, `segmentResults[]`, `imageResults[]`, `manifestLocation`,
  `backupStorageUsed`
- **IngressInfo**: `ingressId`, `name`, `streamKey`, `url`, `inputType`,
  `enableTranscoding`, `audio`, `video`, `roomName`, `participantIdentity`,
  `participantName`, `participantMetadata`, `reusable`, `state`, `enabled`

**Security:** `room.turnPassword` and `ingressInfo.streamKey` are credentials. Don't log the
raw payload wholesale.

## Delivery and Retries

LiveKit's docs: "Due to the protocol's push-based nature, there are no guarantees around
delivery. LiveKit aims to mitigate transient failures by retrying a webhook request
multiple times. Each message undergoes several delivery attempts before being abandoned.
If multiple events are queued for delivery, LiveKit properly sequences them, only
delivering newer events after older ones have been delivered or abandoned."

- At-least-once while it lasts; sequenced per sender queue. No attempt count, backoff or
  timeout is published.
- The sender's queue is bounded; when it overflows, events are **dropped** and the count is
  reported in the next delivery's `numDropped`. Treat a non-zero value as a monitoring
  alert.
- Dedupe on `id`. Return 2xx quickly and process asynchronously. Return 2xx for unknown
  event names: a 4xx counts as a failure and burns retries.
- Because delivery is not guaranteed, reconcile room/participant state from the
  RoomService API (`ListRooms`, `ListParticipants`) rather than deriving it from webhooks
  alone.

## Full Event Reference

- [LiveKit webhooks & events](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/)
- [RoomService API (Room, ParticipantInfo, TrackInfo)](https://docs.livekit.io/reference/other/roomservice-api/)
- [Egress API (EgressInfo, WebhookConfig)](https://docs.livekit.io/reference/other/egress/api/)
- [Ingress API (IngressInfo)](https://docs.livekit.io/reference/other/ingress/api/)
