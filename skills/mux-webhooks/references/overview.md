# Mux Webhooks Overview

## What Are Mux Webhooks?

Mux sends webhooks to tell your application about things that happen asynchronously in Mux Video, outside an API request cycle: an asset finishing processing (`processing` → `ready`), a direct upload completing, or a live stream starting and ending. Mux makes a `POST` request with a JSON body to the URL you configure.

Key behaviors (from the [Mux docs](https://www.mux.com/docs/core/listen-for-webhooks)):

- **Scoped per environment.** A webhook receives every event for the Mux environment it is configured in. If events don't arrive, check you configured the endpoint in the right environment.
- **Retries for 24 hours.** If Mux doesn't get a `2xx` response, it keeps retrying for the next 24 hours with increasing delays.
- **5-second timeout.** Each attempt times out after 5 seconds and is retried. Respond quickly and do heavy work asynchronously.
- **Duplicates are possible.** Mux may deliver the same message more than once even after a `2xx`. Deduplicate on the event `id`.
- **Prefer webhooks to polling.** Mux rate limits `GET /assets`; use `video.asset.ready` instead of polling asset status.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `video.asset.created` | An asset has been created | Record the asset ID, show "processing" in your UI |
| `video.asset.ready` | Asset is ready for playback | Store the `playback_id`, publish the video |
| `video.asset.errored` | Asset encountered an error (input URL Mux can't download, invalid video file) | Notify the uploader, mark the record failed |
| `video.asset.deleted` | Asset has been deleted | Remove it from your catalog |
| `video.asset.live_stream_completed` | A live stream ended and its recorded asset is complete | Publish the VOD replay |
| `video.upload.asset_created` | A direct upload created an asset | Link the uploaded asset to the user who uploaded it |
| `video.live_stream.active` | Live stream is active and its playback ID can be used | Show a "live" badge, start the player |
| `video.live_stream.idle` | The live stream's reconnect window elapsed; status is now `idle` | Show "stream ended" |

## Full Event List

**Asset events**

- `video.asset.created`
- `video.asset.ready`
- `video.asset.errored`
- `video.asset.updated`
- `video.asset.deleted`
- `video.asset.live_stream_completed`
- `video.asset.static_rendition.created`
- `video.asset.static_rendition.ready`
- `video.asset.static_rendition.skipped`
- `video.asset.static_rendition.deleted`
- `video.asset.static_rendition.errored`
- `video.asset.master.ready`
- `video.asset.master.preparing`
- `video.asset.master.deleted`
- `video.asset.master.errored`
- `video.asset.track.created`
- `video.asset.track.ready`
- `video.asset.track.errored`
- `video.asset.track.deleted`
- `video.asset.warning`

**Upload events**

- `video.upload.asset_created`
- `video.upload.cancelled`
- `video.upload.created`
- `video.upload.errored`

**Live stream events**

- `video.live_stream.created`
- `video.live_stream.connected`
- `video.live_stream.recording`
- `video.live_stream.active`
- `video.live_stream.disconnected`
- `video.live_stream.idle`
- `video.live_stream.updated`
- `video.live_stream.enabled`
- `video.live_stream.disabled`
- `video.live_stream.deleted`
- `video.live_stream.warning`

**Simulcast target events**

- `video.live_stream.simulcast_target.created`
- `video.live_stream.simulcast_target.idle`
- `video.live_stream.simulcast_target.starting`
- `video.live_stream.simulcast_target.broadcasting`
- `video.live_stream.simulcast_target.errored`
- `video.live_stream.simulcast_target.updated`
- `video.live_stream.simulcast_target.deleted`

A machine-readable schema of every event is published at [`https://www.mux.com/webhook-spec.json`](https://www.mux.com/webhook-spec.json).

## Event Payload Structure

```json
{
  "type": "video.asset.ready",
  "object": {
    "type": "asset",
    "id": "0201p02fGKPE7MrbC269XRD7LpcHhrmbu0002"
  },
  "id": "3a56ac3d-33da-4366-855b-f592d898409d",
  "environment": {
    "name": "Demo pages",
    "id": "j0863n"
  },
  "data": {
    "status": "ready",
    "id": "0201p02fGKPE7MrbC269XRD7LpcHhrmbu0002",
    "duration": 153.361542,
    "created_at": "2018-02-15T01:04:45.000Z",
    "aspect_ratio": "40:17"
  },
  "created_at": "2018-02-15T01:04:45.000Z",
  "accessor_source": null,
  "accessor": null,
  "request_id": null
}
```

| Field | Description |
|-------|-------------|
| `type` | Event type string, e.g. `video.asset.ready` |
| `id` | Unique event ID — use for idempotency |
| `object` | `type` and `id` of the resource the event is about |
| `environment` | The Mux environment (`name`, `id`) that produced the event |
| `data` | The resource itself (asset, upload, live stream, …) at the time of the event |
| `created_at` | When the event was created (ISO 8601) |

## Full Event Reference

For descriptions of every event, see [Mux's webhook documentation](https://www.mux.com/docs/core/listen-for-webhooks#types-of-events).
