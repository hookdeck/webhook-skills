# Dolby OptiView Real-time (Millicast) Webhooks Overview

## What Millicast Sends

Dolby OptiView Real-time Streaming (formerly Millicast) is a WebRTC live-streaming platform. When you create a webhook you pick which hook types it receives:

| Hook type | `type` value | Notifies when |
|---|---|---|
| [Feed hooks](https://optiview.dolby.com/docs/millicast/webhooks/feeds/) | `feeds` | A stream starts (`started`) or stops (`ended`) publishing |
| [Media hooks](https://optiview.dolby.com/docs/millicast/webhooks/media/) | `media` / `recordings` | Server-side recordings start, complete or are deleted |
| [Thumbnail hooks](https://optiview.dolby.com/docs/millicast/webhooks/thumbnail/) | (none: JPEG body) | A thumbnail is captured during a live stream |
| [Transcoder hooks](https://optiview.dolby.com/docs/millicast/webhooks/transcoder/) | `transcoder` | A transcoder changes status, such as starting or stopping |
| [ViewerConnection hooks](https://optiview.dolby.com/docs/millicast/webhooks/viewerconnection/) | `viewerConnection` | A viewer connects to an inactive stream, or no viewers remain |

## JSON Envelope

| Field | Meaning |
|---|---|
| `type` | Hook type (table above) |
| `event` | Event name, such as `started` or `ended` |
| `timestamp` | Epoch milliseconds when the request was sent |
| `data` | Event data for the type. Feed events carry `feedId`, `accountId`, `name`, `streamId`, `active`, and `started` or `ended` |

## Thumbnails

Thumbnail hooks POST the image itself, `Content-Type: image/jpeg`, at the stream's resolution. Headers: `x-millicast-timestamp`, `x-millicast-feed-id`, `x-millicast-stream-id`, `x-millicast-token-id` and `x-millicast-signature`. Scheduled thumbnails arrive every 30 seconds per active stream (not configurable); on-demand thumbnails are limited to 6 per minute per stream name and token.

Your server must keep the raw bytes and accept bodies of a few megabytes (the Express example sets a 10 MB limit).

## Delivery

- **Method:** `POST`.
- **Retries:** none. "The request will not attempt a retry if the service is unavailable or returns an error code."
- **Ordering:** "The events are sent asynchronously, so the order of events is not guaranteed." Use `timestamp` (and `started` / `ended` in feed data) to order them.
- **Timeout:** not documented.
