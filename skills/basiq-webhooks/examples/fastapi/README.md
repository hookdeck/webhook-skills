# Basiq Webhooks - FastAPI Example

Minimal example of receiving [Basiq](https://basiq.io) webhooks with signature verification in FastAPI. Basiq signs deliveries with the Standard Webhooks scheme, so the handler verifies `webhook-id`, `webhook-timestamp` and `webhook-signature` with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Python 3.9+
- A Basiq application and API access
- The signing secret (`whsec_...`) of your webhook subscription

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

3. Put the subscription's signing secret in `BASIQ_WEBHOOK_SECRET`, including the `whsec_` prefix. It is returned as `secret` when you create the subscription (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/basiq`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Basiq does and cover tampered bodies, stale and future timestamps, multiple signatures, another subscription's secret, the `svix-*` header fallback, resent messages, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 basiq --path /webhooks/basiq
```

Create a subscription with `POST /notifications/webhooks` using the printed URL, then send a test message with `POST /notifications/messages/test`. A new subscription can take up to 15 minutes to start delivering.

## Notes

- The dependency reads `await request.body()` so the HMAC covers the exact bytes Basiq sent. Calling `request.json()` first breaks verification.
- If `BASIQ_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery.
- The library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so use the manual verifier in [references/verification.md](../../references/verification.md) if you need to widen or drop it.
- Payloads are thin (`eventTypeId`, `eventId`, `links`). Fetch `links.eventEntity` from the Basiq API for the data.
