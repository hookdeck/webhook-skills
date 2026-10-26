# OpenRouter Webhooks Overview

## What Are OpenRouter Webhooks?

OpenRouter is a unified API for LLM and media-generation models. Video generation is asynchronous: you submit `POST /api/v1/videos` and get back a job `id`, `polling_url` and `status`. Instead of polling, you can pass a `callback_url` and OpenRouter will `POST` a signed terminal-state update to it when the job ends.

> OpenRouter signs only video-generation callbacks (the callback_url of a video request). Use this source for those callbacks.

OpenRouter's Broadcast "Webhook" destination (OTLP traces) is a different feature: it is unsigned and out of scope here.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `video.generation.completed` | The job finished successfully | Store the job, download the video from `data.unsigned_urls[0]`, record `data.usage.cost` |
| `video.generation.failed` | The job failed | Mark the job failed, surface `data.error`, retry or refund |
| `video.generation.cancelled` | The job was cancelled | Mark the job cancelled |
| `video.generation.expired` | The job expired before completing | Mark the job expired, resubmit if needed |

These four are the documented event types. Dispatch on the body's `type` field and log anything else.

## Event Payload Structure

The payload is an event envelope with the job fields inside `data`:

```json
{
  "type": "video.generation.completed",
  "created_at": "2026-10-26T12:00:00.000Z",
  "data": {
    "id": "Nxff2D1Z6w4Zk9iNuZam",
    "status": "completed",
    "generation_id": "gen-123",
    "model": "google/veo-3.1-lite",
    "unsigned_urls": ["https://example.com/video.mp4"],
    "usage": { "cost": 0.4, "is_byok": false }
  }
}
```

- `data.status` is `completed`, `failed`, `cancelled` or `expired`.
- `unsigned_urls`, `usage` appear on completed jobs; `error` appears on failed ones.
- If a download URL points at the OpenRouter API, send your bearer token when downloading it.

## Headers

| Header | Meaning |
|--------|---------|
| `X-OpenRouter-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>` |
| `X-OpenRouter-Idempotency-Key` | Stable per job and outcome (e.g. `<job id>-completed`); use it to deduplicate retries |
| `Content-Type` | `application/json` |

Deliveries are `POST`. A valid delivery should be answered with `204`; an invalid signature with `401`. Retries happen, but the schedule is not documented.

## Full Event Reference

See [OpenRouter's video generation webhooks guide](https://openrouter.ai/docs/cookbook/video-generation/video-generation-webhooks) and the [create video generation request API reference](https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request.md).
