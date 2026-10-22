# Bland AI Webhooks - FastAPI Example

Minimal example of receiving [Bland AI](https://www.bland.ai) post-call webhooks with `X-Webhook-Signature` (HMAC-SHA256) verification.

## Prerequisites

- Python 3.9+
- A Bland account with a webhook signing secret (Dev Portal → Account Settings → Keys → **Replace Secret**; shown once, see [setup](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Bland webhook signing secret to `BLAND_WEBHOOK_SECRET` in `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/bland-ai`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Bland's algorithm (`hex(HMAC-SHA256(secret, body))`) and cover post-call payloads, failed calls, enrichment payloads (`citations`, `post_transfer_transcript`, `evals`, `multiple`), SMS payloads, tampered bodies, wrong secrets, redeliveries, non-JSON content types, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 bland-ai --path /webhooks/bland-ai
```

Pass the printed `https://` URL as the `webhook` parameter when sending a call (or set it on an inbound number), then place a call and let it end.

## Notes

- The verification dependency reads `await request.body()` (raw bytes) before parsing, so the signature covers exactly what Bland sent whatever the content type. Bland's docs sign `JSON.stringify(req.body)`; for the compact JSON Bland sends that is byte-identical to the raw body.
- Bland sends no timestamp or message id, so there is no replay window. Dedupe on `call_id` (plus `event_type`, since citations and evals arrive as separate webhooks for the same call).
- If `BLAND_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Enterprise JWT-signed webhooks (RS256 + JWKS) are a different scheme and are not covered here.
