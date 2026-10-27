# Argil Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Argil](https://www.argil.ai) webhooks with signature verification. Argil signs deliveries per [Standard Webhooks](https://www.standardwebhooks.com), so the handler verifies `webhook-id`, `webhook-timestamp` and `webhook-signature` with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. If `webhook-id` is absent it falls back to the `svix-*` headers, the same scheme with the other prefix.

## Prerequisites

- Python 3.9+
- An Argil API key and a webhook created with `POST /webhooks` (see [setup](../../references/setup.md))
- The `whsec_...` secret from that create response. Argil returns it once.

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's secret in `ARGIL_WEBHOOK_SECRET`. Webhooks created before Argil added signing are unsigned and have no secret: recreate the webhook to get a `whsec_` secret.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/argil` ([main.py](main.py)).

## Test

```bash
pytest test_webhook.py -v
```

The tests use FastAPI's `TestClient` with payloads signed per Standard Webhooks (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover all four events, tampered bodies, stale timestamps, multiple signatures, another webhook's secret, the `svix-*` fallback, retried deliveries and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 argil --path /webhooks/argil
```

Register the printed URL as the `callbackUrl` of a webhook subscribed to events such as `VIDEO_GENERATION_SUCCESS`, then render a video.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so calling `request.json()` before verification breaks it.
- If `ARGIL_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library enforces a 5-minute timestamp window. Retries and replays keep the original timestamp, so late ones fail. See [verification](../../references/verification.md) for a manual verifier without a window.
- The payload has no event ID. The handler dedupes on `webhook-id`, which stays the same across retries.
- Argil needs a `2xx` within **10 seconds** and doesn't follow redirects. Enqueue the event and process it asynchronously in production.
