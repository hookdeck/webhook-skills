# HeyGen Webhooks Overview

## What Are HeyGen Webhooks?

Instead of polling `GET /v3/videos/{video_id}`, you register a webhook endpoint with the v3 API (`https://api.heygen.com/v3/webhooks/endpoints`) and HeyGen sends a `POST` with a JSON body when a video finishes rendering, a translation completes, or a job fails. Each endpoint has its own signing secret; every delivery carries a `signature` header (hex HMAC-SHA256 of the raw body).

You can also pass a one-off `callback_url` (and `callback_id`) when creating a video, Video Agent session, or video translation. The `callback_id` is echoed back in the payload.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `avatar_video.success` | Avatar video completed | Download the file, notify the user |
| `avatar_video.fail` | Avatar video generation failed | Mark failed, retry or alert |
| `video_translate.success` | Video translation completed | Fetch the translated video |
| `video_translate.fail` | Video translation failed | Mark failed, alert |
| `video_agent.success` / `video_agent.fail` | Video Agent session completed / failed | Fetch the session's videos |

Other documented event types: `avatar_video_gif.success|fail`, `avatar_video_caption.success|fail`, `personalized_video`, `instant_avatar.success|fail`, `photo_avatar_generation.success|fail`, `photo_avatar_train.success|fail`, `photo_avatar_add_motion.success|fail`, `proofread_creation.success|fail`, `live_avatar.success|fail`. List them with `GET /v3/webhooks/event-types`.

## Event Payload Structure

```json
{
  "event_type": "avatar_video.success",
  "event_data": {
    "video_id": "vid_xyz789",
    "url": "https://files.heygen.com/video/vid_xyz789.mp4",
    "gif_download_url": "https://resource.heygen.ai/video/vid_xyz789/gif.gif",
    "video_page_url": "https://app.heygen.com/videos/vid_xyz789",
    "video_share_page_url": "https://app.heygen.com/share/vid_xyz789",
    "folder_id": null,
    "callback_id": null
  }
}
```

The docs document `event_data` fields only for `avatar_video.success`; the example above is taken from HeyGen's "list delivered events" response, which also carries `event_id` and `created_at`. For other event types, treat the webhook as a completion signal and fetch the authoritative state from the API (`GET /v3/videos/{video_id}`, `GET /v3/video-translations/{id}`, `GET /v3/video-agents/{session_id}`). The `url` is pre-signed and expires.

## Delivery

- Respond `2xx` within 10 seconds.
- Failed deliveries are retried with exponential backoff for up to 24 hours.
- A retry resends the same payload; dedupe on `event_data.video_id` + `event_type` (or your `callback_id`).

## Full Event Reference

See [HeyGen's webhook events documentation](https://developers.heygen.com/docs/webhook-events).
