# Replicate Webhooks Overview

## What Are Replicate Webhooks?

Replicate uses webhooks to notify your application about prediction status changes in real-time. Instead of polling for prediction results, you can receive instant notifications when predictions start, generate output, produce logs, or complete.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `start` | Prediction begins processing | Update UI to show "processing" state, notify users |
| `output` | Prediction generates output | Stream partial results, display progress |
| `logs` | Log output is generated | Display progress messages, debug information |
| `completed` | Prediction reaches terminal state (succeeded/failed/canceled) | Process final results, handle errors, update database |

## Event Payload Structure

All Replicate webhook events follow this structure:

```json
{
  "type": "start|output|logs|completed",
  "data": {
    "id": "prediction_id",
    "status": "starting|processing|succeeded|failed|canceled",
    "input": {
      // Your original input parameters
    },
    "output": null, // or prediction results
    "logs": "", // cumulative log output
    "error": null, // error message if failed
    "created_at": "2024-01-01T00:00:00.000Z",
    "started_at": "2024-01-01T00:00:01.000Z",
    "completed_at": null, // or completion timestamp
    "urls": {
      "get": "https://api.replicate.com/v1/predictions/...",
      "cancel": "https://api.replicate.com/v1/predictions/.../cancel"
    },
    "metrics": {
      "predict_time": 0.5 // time in seconds
    }
  }
}
```

## Webhook Events Filter

You can control which events trigger webhook requests using `webhook_events_filter`:

- **Default behavior**: Sends requests for new outputs and prediction completion
- **Custom filtering**: Specify exact events you want to receive
- **Rate limiting**: Events are throttled to max once per 500ms (except `start` and `completed`)

Example configuration:
```javascript
const prediction = await replicate.run(model, {
  input: { /* ... */ },
  webhook: "https://example.com/webhooks/replicate",
  webhook_events_filter: ["start", "completed"] // Only receive start and completed events
});
```

## Prediction Status Flow

1. **starting** → Prediction created, waiting for resources
2. **processing** → Model is actively running
3. **succeeded** → Completed successfully with output
4. **failed** → Error occurred during processing
5. **canceled** → Prediction was manually canceled

## Full Event Reference

For the complete list of webhook details and configuration options, see [Replicate's webhook documentation](https://replicate.com/docs/topics/webhooks).