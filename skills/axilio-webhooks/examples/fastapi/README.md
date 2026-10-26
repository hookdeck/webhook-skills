# Axilio Webhooks - FastAPI Example

Minimal example of receiving [Axilio](https://axilio.ai) webhooks with Standard Webhooks signature verification, using the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package that Axilio's docs recommend.

## Prerequisites

- Python 3.9+
- An Axilio organization with a webhook destination registered under Settings > Webhooks
- The destination's signing secret (`whsec_...`). Axilio shows it **only once**, at registration (see [setup](../../references/setup.md))

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

3. Add the full signing secret, including the `whsec_` prefix, to `AXILIO_WEBHOOK_SECRET` in `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/axilio`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads with Axilio's algorithm (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`) and cover all 28 documented event types, dashboard test deliveries, non-JSON content types, tampered bodies, stale timestamps, multiple signatures, redeliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 axilio --path /webhooks/axilio
```

Register the printed `https://` URL as a destination in Settings > Webhooks, subscribe to the events you want, then click **Test** on the destination's page to send an event's example payload (`"test": true`).

## Notes

- The verification dependency reads `await request.body()`. The signature covers the exact raw bytes, so `request.json()` before verification breaks it. Reading bytes works for any content type.
- If `AXILIO_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so a retry later than that is rejected. [references/verification.md](../../references/verification.md) has a manual verifier where the window can be dropped or widened.
- Axilio delivers at least once and does not guarantee order. Redeliveries are deduped on the body `id` (in memory here; use a database or cache in production), and `occurred_at` tells you which event is newer.
