# OpenRouter Webhooks Overview

## What Are OpenRouter Webhooks?

OpenRouter is a unified API for LLM and media-generation models. Video generation and the Batch API are asynchronous: you submit `POST /api/v1/videos` or `POST /api/v1/batches` and get back an `id`. Instead of polling, you can pass a `callback_url` and OpenRouter will `POST` a final-status update to it when the job or batch ends.

OpenRouter sends signed callbacks for two kinds of job: video generation (`POST /api/v1/videos`) and the Batch API (`POST /api/v1/batches`). Both use the same workspace signing secret and the same `X-OpenRouter-Signature` scheme, so one receiver can verify both.

OpenRouter's Broadcast "Webhook" destination (OTLP traces) is a different feature: it has no signature (you add your own headers) and is out of scope here.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `video.generation.completed` | The job finished successfully | Store the job, download the video from `data.unsigned_urls[0]`, record `data.usage.cost` |
| `video.generation.failed` | The job failed | Mark the job failed, surface `data.error`, retry or refund |
| `video.generation.cancelled` | The job was cancelled | Mark the job cancelled |
| `video.generation.expired` | The job expired before completing | Mark the job expired, resubmit if needed |
| `batch.completed` | The batch finished; some requests can still have errors | Fetch the batch and read `results` |
| `batch.failed` | A check failed, or the provider rejected the batch | Fetch the batch and read `error.message` |
| `batch.expired` | The provider didn't finish before `expires_at` | Fetch the batch, resubmit unfinished work |
| `batch.cancelled` | The provider cancelled the batch | Fetch the batch, resubmit if needed |

These eight are the documented event types. Dispatch on the body's `type` field and log anything else.

## Event Payload Structure

A video callback is an event envelope with the job fields inside `data`. OpenRouter's API reference example (storage token redacted):

```json
{
  "type": "video.generation.completed",
  "created_at": "2026-11-10T22:30:00.000Z",
  "data": {
    "id": "gen-vid-1789480874-Ab3dEf9hIjKlMnOpQrSt",
    "generation_id": "gen-vid-1789480874-Ab3dEf9hIjKlMnOpQrSt",
    "model": "google/veo-3.1",
    "status": "completed",
    "urls": [
      "https://storage.openrouter.ai/generated-media/video-sample.mp4?token=REDACTED"
    ],
    "expires_at": 1789567274,
    "unsigned_urls": [
      "/api/v1/videos/gen-vid-1789480874-Ab3dEf9hIjKlMnOpQrSt/content?index=0"
    ],
    "usage": {
      "cost": 0.5,
      "is_byok": false
    }
  }
}
```

- `data.status` is `completed`, `failed`, `cancelled` or `expired`.
- `unsigned_urls`, `usage` appear on completed jobs; `error` appears on failed ones.
- If a download URL points at the OpenRouter API, send your bearer token when downloading it.

A batch callback carries only the batch ID. OpenRouter's batch quickstart example:

```json
{
  "id": "evt_51504673caddb4daeaed47e7de1dde8e",
  "object": "event",
  "type": "batch.completed",
  "created_at": 1792445705,
  "data": { "id": "batch_123" }
}
```

A repeated delivery of the same batch event has the same `id`. The webhook can arrive a few seconds before `GET /api/v1/batches/{id}` shows the final status, so retry the fetch if they don't match yet.

## Headers

| Header | Meaning |
|--------|---------|
| `X-OpenRouter-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>`, sent only once the workspace has a signing secret |
| `X-OpenRouter-Idempotency-Key` | `<jobId>-<status>` or `<batch id>-<status>`; use it to deduplicate retries |
| `Content-Type` | `application/json` |

Deliveries are `POST`. A valid delivery should be answered with `204`; an invalid signature with `401`. Retries happen, but the schedule is not documented.

## Full Event Reference

See [OpenRouter's video generation webhooks guide](https://openrouter.ai/docs/cookbook/video-generation/video-generation-webhooks), the [Video Generation API reference](https://openrouter.ai/docs/api_reference/videos) and the [Batch API quickstart](https://openrouter.ai/docs/batch-quickstart#option-a-wait-with-a-webhook).
