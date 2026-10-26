# Setting Up Baseten Webhooks

## Prerequisites

- Baseten account with a deployed model that supports async inference
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Get Your Webhook Secret

Create a webhook secret in the Baseten Secrets tab and paste it here. Without one, deliveries are unsigned and fail verification.

1. Open [Baseten Settings → Secrets](https://app.baseten.co/settings/secrets).
2. Create a webhook secret.
3. Store it as `BASETEN_WEBHOOK_SECRET`. Use it exactly as shown, as UTF-8 bytes (do not hex- or base64-decode it).

The `X-BASETEN-SIGNATURE` header is only included once a secret is configured. During rotation, both old and new secrets remain valid for 24 hours.

## Register Your Endpoint

Webhooks are configured per request. Pass `webhook_endpoint` when calling `/async_predict`:

```python
import requests, os

resp = requests.post(
    f"https://model-{model_id}.api.baseten.co/production/async_predict",
    headers={"Authorization": f"Api-Key {os.environ['BASETEN_API_KEY']}"},
    json={
        "model_input": {"prompt": "hello"},
        "webhook_endpoint": "https://example.com/webhooks/baseten",
    },
)
print(resp.json()["request_id"])
```

There is no event selection: every completed request (success or failure) triggers one `async_request_completed` callback.

## Testing

- Run `npx hookdeck-cli listen 3000 baseten --path /webhooks/baseten` and use the tunnel URL as `webhook_endpoint`.
- Poll `GET /async_request/{request_id}` to compare status with what the webhook reports. `WEBHOOK_FAILED` means inference succeeded but delivery failed.
