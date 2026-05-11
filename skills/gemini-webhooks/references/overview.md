# Gemini Webhooks Overview

## What Are Gemini Webhooks?

Gemini API webhooks are event-driven HTTP callbacks that notify your application when
long-running operations on `generativelanguage.googleapis.com` finish. They replace
polling for the Batch API, the Veo video generation API, and the Interactions API
(function-calling LROs).

Webhooks follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification,
so the signature scheme, header names, and replay protection match other Standard
Webhooks-based providers (e.g. OpenAI, Clerk).

## Common Use Cases

- **Batch API**: Get notified when a batch completes, fails, is cancelled, or expires.
- **Video Generation (Veo)**: Receive `video.generated` when a video LRO finishes.
- **Interactions API**: Handle function-call LROs without polling — react to
  `interaction.requires_action`, `interaction.completed`, `interaction.failed`,
  `interaction.cancelled`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `batch.succeeded` | Batch job finished successfully | Download `output_file_uri`, fan out results |
| `batch.failed` | Batch job hit a system or validation error | Alert team, inspect `error_code`/`error_message` |
| `batch.cancelled` | User cancelled the batch | Clean up resources |
| `batch.expired` | Batch not processed within 24 hours | Resubmit, alert |
| `video.generated` | Video generation (Veo) completed | Download via `data.output_file_uri`; filename in `data.file_name` |
| `interaction.completed` | LRO function-calling interaction succeeded | Consume result, continue flow |
| `interaction.requires_action` | Model requested a function call | Run the tool, post the result back |
| `interaction.failed` | Interaction failed | Surface error to user |
| `interaction.cancelled` | Interaction cancelled | Update UI / state |

## Event Payload Structure

All Gemini webhook events follow the Standard Webhooks payload shape:

```json
{
  "type": "batch.succeeded",
  "version": "v1",
  "timestamp": "2026-05-04T12:00:00Z",
  "data": {
    "id": "batch_123456",
    "output_file_uri": "gs://..."
  }
}
```

Gemini uses a **thin payload model** — the body carries pointers and status, not the
full output. For batch jobs, follow `data.output_file_uri` to fetch results. For video
generation, follow `data.output_file_uri` (with `data.file_name` for the filename).
Failure events include `error_code` and `error_message` inside `data`.

Dynamic webhooks may also include `user_metadata` (provided in the original request) so
you can route the callback to the right user, tenant, or job in your system.

## Key Fields

- **`type`** — Event type (e.g. `batch.succeeded`)
- **`version`** — Payload schema version (`v1` at launch)
- **`timestamp`** — ISO 8601 time the event was created
- **`data.id`** — Resource id (batch job, interaction, or video operation)
- **`data.output_file_uri`** — Pointer to results for `batch.succeeded` events
- **`data.output_file_uri`** — Pointer to the rendered video for `video.generated` events
- **`data.file_name`** — Filename of the rendered video for `video.generated` events
- **`data.error_code` / `data.error_message`** — Present on failure events

## Event Delivery

- **Transport**: HTTPS POST to your configured endpoint
- **Response window**: respond with 2xx within seconds — heavy work should be queued
- **Delivery semantics**: at-least-once — deduplicate on `webhook-id`
- **Retries**: automatic for 24 hours with exponential backoff
- **Headers**: Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`)

## Full Event Reference

For the complete list of events, payload fields, and lifecycle diagrams, see the
[Gemini API webhooks documentation](https://ai.google.dev/gemini-api/docs/webhooks).
