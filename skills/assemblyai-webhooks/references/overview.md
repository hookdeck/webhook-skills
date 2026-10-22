# AssemblyAI Webhooks Overview

## What Are AssemblyAI Webhooks?

AssemblyAI is a speech-to-text API. Transcription is asynchronous, so instead of polling you
can pass a `webhook_url` when you create a transcript. When the transcript finishes,
AssemblyAI sends one `POST` to that URL. This covers webhooks for pre-recorded audio; the
streaming API is documented separately.

AssemblyAI does **not** sign these requests. To authenticate them, set
`webhook_auth_header_name` and `webhook_auth_header_value` on the transcript request:
AssemblyAI adds that header to the delivery verbatim.

## Common Event Types

There is no event-type field. The `status` in the payload plays that role:

| Status | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `completed` | The transcript finished successfully | Fetch the transcript, store text, trigger summaries or search indexing |
| `error` | Transcription failed | Fetch the transcript to read its `error` field, alert, resubmit |

## Event Payload Structure

```json
{
  "transcript_id": "5552493-16d8-42d8-8feb-c2a16b56f6e8",
  "status": "completed"
}
```

| Key | Type | Description |
|-----|------|-------------|
| `transcript_id` | string | The ID of the transcript |
| `status` | string | `completed` or `error` |

The payload holds no transcript text and no error details. Call
`GET https://api.assemblyai.com/v2/transcript/{transcript_id}` (with your API key in the
`authorization` header) to get the text, or the `error` field when `status` is `error`. That
response also has `webhook_status_code`, the HTTP status AssemblyAI received from your endpoint.

## Delivery Behavior

- Your endpoint must return a 2xx within **10 seconds**.
- Otherwise AssemblyAI retries, up to 10 attempts in total, 10 seconds apart.
- A **4xx** response marks the delivery as failed and it is **not retried**.
- Deliveries come from fixed IPs: `44.238.19.20` (US) and `54.220.25.36` (EU).
- To correlate a delivery with your own records, add query parameters to `webhook_url`, for
  example `https://example.com/webhook?customer_id=1234`.

## Full Event Reference

See [AssemblyAI's webhook documentation](https://www.assemblyai.com/docs/deployment/webhooks).
