# OpenAI Webhooks Overview

## What Are OpenAI Webhooks?

OpenAI webhooks are HTTP callbacks that notify your application when asynchronous operations complete. Instead of polling for status updates, OpenAI sends events directly to your endpoint when jobs finish, fail, or change state.

## Common Use Cases

- **Fine-tuning Jobs**: Get notified when model fine-tuning completes
- **Batch API**: Receive alerts when batch processing finishes
- **Realtime API**: Handle session lifecycle events
- **Async Operations**: Track long-running API operations

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
| `realtime.call.incoming` | Realtime API incoming call | Handle incoming call, connect client |

## Event Payload Structure

All OpenAI webhook events follow this structure:

```json
{
  "id": "evt_123abc",
  "type": "fine_tuning.job.succeeded",
  "created_at": 1234567890,
  "data": {
    "id": "ftjob-ABC123",
    "object": "fine_tuning.job",
    "model": "gpt-3.5-turbo-0125",
    "created_at": 1234567890,
    "finished_at": 1234567900,
    "fine_tuned_model": "ft:gpt-3.5-turbo-0125:my-org:custom-model:8ABC123",
    "organization_id": "org-123",
    "status": "succeeded",
    // Additional fields specific to event type
  }
}
```

## Key Fields

- **`id`**: Unique identifier for the webhook event
- **`type`**: The event type (e.g., "fine_tuning.job.succeeded")
- **`created_at`**: Unix timestamp when the event was created
- **`data`**: Object containing event-specific data

## Event Delivery

- Events are delivered via HTTP POST to your configured endpoint
- OpenAI expects a 2xx status code within 20 seconds
- Failed deliveries are retried with exponential backoff
- Events include Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) for verification

## Full Event Reference

For the complete list of events and their payloads, see [OpenAI's webhook documentation](https://platform.openai.com/docs/guides/webhooks).