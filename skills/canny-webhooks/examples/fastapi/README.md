# Canny Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Canny](https://canny.io) webhooks with signature verification. Canny signs requests following Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`), verified here with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package inside a FastAPI dependency (`verified_canny_event`).

## Prerequisites

- Python 3.9+
- A Canny account with access to **Your Subdomain > Settings > API**
- The `whsec_...` signing secret shown there once a webhook is added

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

3. Put the signing secret in `CANNY_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/canny`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads the way Canny does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, stale timestamps, two signatures during rotation, a wrong secret, ignored legacy `canny-*` headers, non-JSON content types, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 canny --path /webhooks/canny
```

Add the printed URL as a webhook in Canny's API settings, then create a post or vote.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw body, so `request.json()` before verification breaks it, and any content type verifies.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so a late retry is rejected. For a configurable window, use the manual verifier in [references/verification.md](../../references/verification.md).
- The legacy `canny-timestamp`, `canny-nonce` and `canny-signature` headers are ignored. They are being removed.
- Canny bodies have no event ID. The handler dedupes on `webhook-id`.
- If `CANNY_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
