# Outhire Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Outhire](https://outhire.ai) webhooks with signature verification. Outhire signs deliveries with Standard Webhooks, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. When `webhook-id` is absent it falls back to the `svix-*` spelling of the same headers.

## Prerequisites

- Python 3.9+
- An Outhire admin account with access to **Settings > Webhooks**
- The signing secret (`whsec_...`) of your webhook

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your webhook's signing secret in `OUTHIRE_WEBHOOK_SECRET`, including the `whsec_` prefix. Copy it from the webhook in **Settings > Webhooks** (see [setup](../../references/setup.md)). Each webhook has its own secret.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/outhire`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Outhire does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover `candidate.applied`, `candidate.stage_changed` and `webhook.ping`, tampered bodies, stale timestamps, multiple signatures, another webhook's secret, repeated deliveries, deliveries sent with `svix-*` headers, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 outhire --path /webhooks/outhire
```

Add the printed URL as a webhook in **Settings > Webhooks**, subscribe to `candidate.applied` and `candidate.stage_changed`, then use **Send test ping** to see a `webhook.ping` delivery.

## Notes

- The handler reads `await request.body()`. The signature covers the exact raw body bytes, so `request.json()` before verification breaks it.
- If `OUTHIRE_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Payloads have no event ID. The handler dedupes on the `webhook-id` header.
- Outhire needs a `2xx` within **10 seconds**. Enqueue the event and process it asynchronously in production.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late retries are rejected. See [verification](../../references/verification.md) for a manual verifier where the window can be dropped or widened.
