# Vimeo Webhooks Overview

## What Are Vimeo Webhooks?

Vimeo **app webhooks** send an HTTP POST to a URL you choose when something happens to videos or live events owned by your app's users. You create them through the Vimeo API (there is no dashboard UI), one webhook per event type per app. Each webhook has a `webhook_url`, a `webhook_type` (the event), an `is_enabled` flag, and an optional `secret` used to sign deliveries.

## Common Event Types

The `webhook_type` value is both what you subscribe to and what appears in the delivery body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `video-created` | A user creates a video | Track new uploads |
| `video-deleted` | A user deletes a video | Remove records from your catalog |
| `video-transcode-playable` | A video is ready for playback | Publish the video early |
| `video-transcode-fully-playable` | Playable in all resolutions (up to source quality or 4K, whichever is lower, at standard definition) | Enable full-quality playback |
| `video-transcode-complete` | A video finished transcoding | Mark processing done, fetch files |
| `video-upload-failed` | A video upload fails | Alert the uploader, retry |
| `transcript-status-complete` | A video's transcript completed or failed | Fetch the transcript / text track |
| `automatic-thumbnail-available` | The generated thumbnail is available | Update previews |
| `content-scan-completed` | A version content scan finished | Moderation workflows |
| `live-event-started` | A live event goes live | Notify viewers |
| `live-event-updated` | A user updates a live event | Sync event metadata |
| `live-event-ended` | A live event ends | Close out the stream |
| `live-event-archive-available` | A live event archive is ready | Publish the replay |
| `live-event-clip-created` | A new video is created for a live event | Index the clip |
| `registration-created` / `registration-updated` / `registration-deleted` | A registrant is added, changed, or removed on a lead-capture resource | Sync registrants (change hints; poll the registrants endpoint to reconcile) |

## Event Payload Structure

Every payload has the same envelope. The event name is the `webhook_type` field in the body:

```json
{
  "webhook_type": "video-transcode-complete",
  "data": {
    "clip_uri": "/videos/890352789",
    "video_uri": "/videos/890352789",
    "version_uri": "/videos/890352789/versions/1"
  },
  "timestamp": 1644961452
}
```

`timestamp` is a Unix timestamp of when the event occurred. The `data` fields differ per event:

| Event | `data` fields |
|-------|---------------|
| `video-created`, `video-deleted`, `video-transcode-playable` | `clip_uri`, `video_uri` |
| `video-transcode-fully-playable`, `video-transcode-complete` | `clip_uri`, `video_uri`, `version_uri` |
| `video-upload-failed` | `video_uri`, `error_type`, `failure_cause` |
| `transcript-status-complete` | `transcript_uri`, `text_track_uri`, `transcript_status` (e.g. `completed`), `video_uri` |
| `live-event-started`, `live-event-ended`, `live-event-archive-available`, `live-event-clip-created` | `event_uri`, `clip_uri`, `video_uri` |
| `live-event-updated` | `event_uri` |
| `automatic-thumbnail-available` | `video_uri`, `thumbnail_uri` |
| `content-scan-completed` | `video_uri`, `result`, `version_uri` |
| `registration-*` | `resource_uri`, `registrant_uuid`, `email`, `sequence_number` |

Payloads carry URIs, not full resources; call the Vimeo API (for example `GET /videos/{id}`) for details.

## Idempotency

Vimeo documents no delivery ID header or body field and no retry schedule. Build a deduplication key from `webhook_type`, the primary URI in `data`, and `timestamp`, and make handlers safe to run twice.

## Full Event Reference

For the complete list of events and payloads, see [Vimeo's app webhooks documentation](https://developer.vimeo.com/api/app-webhooks).
