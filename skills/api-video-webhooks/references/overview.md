# api.video Webhooks Overview

## What Are api.video Webhooks?

api.video (video hosting, encoding and live streaming API) sends an HTTP `POST` to your URL when video or live stream events occur. A webhook subscription has a URL and a list of events, and each subscription has its own signature secret (`signatureSecret`, `sig_sec_...`).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `video.source.recorded` | The video's source file has been recorded | Confirm an upload landed |
| `video.encoding.quality.completed` | A rendition finished encoding | Enable playback at that quality |
| `video.caption.generated` | A caption was generated | Publish captions |
| `video.summary.generated` | A summary was generated | Store the summary |
| `live-stream.broadcast.started` | A broadcast started | Notify viewers, mark live |
| `live-stream.broadcast.ended` | A broadcast ended | Finalize the recording |

## Event Payload Structure

The body is flat JSON. `type` carries the event name; `emittedAt` is an ISO 8601 timestamp (it is not signed separately and must not be used as a replay window).

```json
{
  "type": "video.encoding.quality.completed",
  "emittedAt": "2021-01-29T15:46:25.217Z",
  "videoId": "vi0000000000000000000000",
  "liveStreamId": "li0000000000000000000000",
  "encoding": "hls",
  "quality": "720p"
}
```

The `X-Api-Video-WebhookID` header names the subscription, not the event.

## Delivery

A `1xx`/`2xx` response is success; anything above `299` is retried 3 times at 3-second intervals.

## Full Event Reference

For the complete list of events, see [api.video's webhook documentation](https://docs.api.video/reference/create-and-manage-webhooks).
