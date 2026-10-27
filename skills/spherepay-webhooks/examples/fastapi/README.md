# SpherePay Webhooks - FastAPI Example

Minimal example of receiving SpherePay webhooks with signature verification.

## Prerequisites

- Python 3.9+
- SpherePay account with a webhook endpoint registered (`POST /v2/webhook-endpoints`) and its signing secret (`whsec_...`)

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

3. Add your endpoint's signing secret to `.env` (`SPHEREPAY_WEBHOOK_SECRET`). Paste the whole secret, including the whsec_ prefix. SpherePay uses it as a plain HMAC key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler checks `Sphere-Signature` (hex HMAC-SHA256 of `{Sphere-Timestamp}.{raw body}`) using the raw request bytes (`await request.body()`) in a dependency, and parses the JSON only after the check passes. SpherePay does not use Standard Webhooks, so there is no `standardwebhooks`/`svix` dependency. The timestamp check is off by default because Hookdeck retries and replays resend the original timestamp; set `SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to opt in.

## Test

```bash
pytest test_webhook.py -v
```

The suite includes the signature example published in SpherePay's docs (see `references/verification.md`).

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 spherepay --path /webhooks/spherepay
```

Use the Hookdeck URL as the `url` when registering the endpoint. SpherePay makes one delivery attempt per event (no automatic retries), so respond with a 2xx within 15 seconds.
