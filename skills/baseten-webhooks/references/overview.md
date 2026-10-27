# Baseten Webhooks Overview

## What Are Baseten Webhooks?

Baseten (baseten.co) is a model inference platform. Its webhooks are per-request callbacks for **async inference**: you call `/async_predict` with a `webhook_endpoint`, and when the request finishes Baseten sends a `POST` with the model output to that URL. There is no dashboard-level endpoint registration or event subscription.

Endpoints must use HTTPS (except `localhost` for development). Baseten supports HTTP/2 and HTTP/1.1.

## Common Event Types

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `async_request_completed` | An async inference request finishes, successfully or not | Store the model output, mark a job done, alert on `errors` |

This is the only documented value. Nothing in the headers names a type, so dispatch on the body's `type` field and log anything else.

Success and failure share the same type:

- Success: `data` holds the output (`{"output": ...}`) and `errors` is `[]`.
- Failure: `data` is `null` and `errors` holds objects such as `{"code": "MODEL_PREDICT_ERROR", "message": "..."}`.

## Event Payload Structure

```json
{
  "request_id": "9876543210abcdef1234567890fedcba",
  "model_id": "abc123",
  "deployment_id": "def456",
  "type": "async_request_completed",
  "time": "2024-04-30T01:01:08.883423Z",
  "data": { "output": "model response here" },
  "errors": []
}
```

`request_id` matches the response of your original `/async_predict` call. The `X-BASETEN-REQUEST-ID` header carries the same ID.

## Delivery

Best effort. 2 attempts in total (1 retry about 2 s later), 10 s timeout per attempt, retried only on `500`, `502`, `503` and `504`. If both attempts fail the output is lost and the request status becomes `WEBHOOK_FAILED`. Baseten does not store outputs, so write them to storage in your model's `postprocess()` as well.

## Full Event Reference

See [Baseten async inference docs](https://docs.baseten.co/inference/async).
