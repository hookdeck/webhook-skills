# OpenAI Webhooks Overview

## What Are OpenAI Webhooks?

OpenAI webhooks are HTTP callbacks that notify your application when asynchronous operations complete. Instead of polling for status updates, OpenAI sends events directly to your endpoint when jobs finish, fail, or change state.

## Common Use Cases

- **Fine-tuning Jobs**: Get notified when model fine-tuning completes
- **Batch API**: Receive alerts when batch processing finishes
- **Background responses**: Know when a `background: true` response completes, fails or is cancelled
- **Evals**: Learn when an eval run finishes
- **Realtime API**: Accept or reject incoming SIP calls

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `fine_tuning.job.succeeded` | Fine-tuning job finishes successfully | Deploy new model, notify team |
| `fine_tuning.job.failed` | Fine-tuning job encounters error | Alert team, retry with different parameters |
| `fine_tuning.job.cancelled` | Fine-tuning job is manually cancelled | Clean up resources |
| `batch.completed` | Batch API request completes | Process results, trigger downstream tasks |
| `batch.failed` | Batch API request fails | Handle errors, retry failed items |
| `batch.cancelled` | Batch is cancelled | Clean up, refund credits |
| `batch.expired` | Batch API request expires | Clean up, handle timeout |
| `realtime.call.incoming` | Incoming SIP call is ready for the Realtime API | Accept or reject the call with `data.call_id` |
| `response.completed` | Background response finishes | Retrieve the response output |

## Event Payload Structure

All OpenAI webhook events follow this structure:

```json
{
  "object": "event",
  "id": "evt_685343a1381c819085d44c354e1b330e",
  "type": "response.completed",
  "created_at": 1750287018,
  "data": { "id": "resp_abc123" }
}
```

Payloads are thin: for most events `data` holds only the ID of the response, batch, job or eval run, so retrieve the object from the API for its details. SIP call events (`realtime.call.incoming`) carry `call_id` and `sip_headers` instead.

## Key Fields

- **`id`**: Unique identifier for the webhook event
- **`type`**: The event type (e.g., "fine_tuning.job.succeeded")
- **`created_at`**: Unix timestamp when the event was created
- **`data`**: Usually just the affected object's `id`

## Event Delivery

- Events are delivered via HTTP POST to your configured endpoint
- OpenAI expects a 2xx status code within a few seconds
- Failed deliveries are retried with exponential backoff for up to 72 hours
- 3xx redirects are not followed and count as failures
- Duplicates are rare but possible; use the `webhook-id` header as the idempotency key
- Events include Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) for verification

## Full Event Reference

For the complete list of events and their payloads, see [OpenAI's webhook events reference](https://developers.openai.com/api/reference/resources/webhooks).