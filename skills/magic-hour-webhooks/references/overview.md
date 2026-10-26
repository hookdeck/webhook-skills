# Magic Hour Webhooks Overview

## What Are Magic Hour Webhooks?

Magic Hour (magichour.ai) is an AI video, image and audio generation API. Render jobs run in the
background, and instead of polling the job details endpoint you register a webhook in the
Developer Hub. Magic Hour then sends a `POST` request to your endpoint when a job starts,
completes or errors.

## Common Event Types

There are nine events, named `{resource}.{action}`:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `video.started` | Video job moves from `queued` to `rendering` | Show a "processing" state |
| `video.completed` | Video finished successfully | Download the file from `payload.downloads` |
| `video.errored` | Video job failed | Log `payload.error`, notify the user |
| `image.started` | Image job begins rendering | Track start time |
| `image.completed` | Image finished successfully | Download the images |
| `image.errored` | Image job failed | Log the error, retry if appropriate |
| `audio.started` | Audio job begins rendering | Track start time |
| `audio.completed` | Audio finished successfully | Download the audio |
| `audio.errored` | Audio job failed | Log the error, notify the user |

`canceled` is a job status, not an event: a canceled job fires no webhook, so poll the details
endpoint if you need to detect cancellations.

## Event Payload Structure

```json
{
  "type": "video.completed",
  "payload": {
    "id": "clx7uu86w0a5qp55yxz315r6r",
    "status": "complete",
    "credits_charged": 450,
    "downloads": [
      {
        "url": "https://videos.magichour.ai/clx7uu86w0a5qp55yxz315r6r/output.mp4",
        "expires_at": "2024-10-19T05:16:19.027Z"
      }
    ],
    "error": null
  }
}
```

- `type` is the event name; dispatch on it.
- `payload` has the same shape as `GET /v1/video-projects/:id`, `/v1/image-projects/:id` or
  `/v1/audio-projects/:id`. Statuses are `rendering`, `complete` and `error`.
- Errored events carry `payload.error` as `{ "code": "...", "message": "..." }`.
- Download URLs expire (video URLs typically after 24 hours): save the file promptly or fetch
  fresh URLs from the API.
- There is **no event ID** in the payload. Deduplicate on `{payload.id}:{type}`, and don't let a
  delayed `*.started` overwrite a terminal state.

## Headers

| Header | Value |
|--------|-------|
| `magic-hour-event-signature` | 64-character hex HMAC-SHA256 digest, no prefix |
| `magic-hour-event-timestamp` | Unix timestamp in seconds, regenerated per delivery attempt |

## Delivery and Retries

Network failures, timeouts and non-2xx responses are retried at 1, 2, 4, 8, ... minutes
(capped at 60 minutes). Events older than 24 hours are marked failed and no longer delivered.
The timestamp and signature are regenerated for every attempt. Magic Hour doesn't state a
timeout, so verify, save the event, and return `200` quickly; do long work afterwards.

## Full Event Reference

See Magic Hour's [webhook quickstart](https://docs.magichour.ai/integration/webhook) and
[securing your handler](https://docs.magichour.ai/integration/webhook/secure-handler) guides.
