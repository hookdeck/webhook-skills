# Argil Webhooks - FastAPI Example

Minimal example of receiving [Argil](https://www.argil.ai) webhooks with signature verification. Argil signs deliveries per Standard Webhooks, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package.

## Prerequisites

- Python 3.9+
- An Argil account with API access
- The `whsec_...` secret returned when you created the webhook

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's secret in `ARGIL_WEBHOOK_SECRET`. `POST /webhooks` returns it **once**. Webhooks created before Argil added signing are unsigned: recreate them (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/argil`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Argil does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, stale timestamps, multiple signatures, a wrong secret, retried deliveries, unsigned requests, non-JSON content types and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 argil --path /webhooks/argil
```

Create a webhook through the Argil API pointing at the printed URL, then generate a video or train an avatar.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw body bytes, so `request.json()` before verification breaks it.
- If `ARGIL_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The library enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so use the manual verifier in [verification](../../references/verification.md) if you receive through Hookdeck.
- The body has no event ID. The handler dedupes on the `webhook-id` header, which stays the same across retries.
- Argil needs a `2xx` within **10 seconds**. Enqueue the event and process it asynchronously in production.
