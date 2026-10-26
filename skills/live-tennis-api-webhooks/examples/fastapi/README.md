# Live Tennis API Webhooks - FastAPI Example

Minimal example of receiving Live Tennis API webhooks with `X-LTAPI-Signature` HMAC-SHA256 verification.

## Prerequisites

- Python 3.9+
- A Live Tennis API direct key on the ULTRA plan
- A webhook registered with `POST /webhooks`, and the `secret` from its 201 response (shown only once)

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

3. Set `LIVE_TENNIS_API_WEBHOOK_SECRET` in `.env` to the `secret` returned when you registered the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, and the webhook endpoint is `POST /webhooks/live-tennis-api`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Live Tennis API's algorithm, `sha256=` + `hex(HMAC-SHA256(secret, raw body))`, and cover valid, tampered, malformed, non-hex, non-ASCII and wrong-length signatures, non-JSON content types, an unsigned timestamp, and every event type.

## How Verification Works

1. The handler reads the **raw** bytes with `await request.body()`, so any content type verifies. It doesn't parse JSON before verifying.
2. It requires `X-LTAPI-Signature` to start with `sha256=` and strips the prefix.
3. It computes `HMAC-SHA256(secret, raw body)` as hex and compares it with `hmac.compare_digest` on encoded bytes, so a non-ASCII header returns 401 instead of raising.
4. `X-LTAPI-Timestamp` is not signed, so there is no replay window. Dedupe on `sequence` (`score`) and `point.seq` (`point`).

Handled events: `score`, `point`, `break_point`, `break_point_result`.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 live-tennis-api --path /webhooks/live-tennis-api
```

Register the printed URL with `POST /webhooks` (HTTPS, publicly routable) and save the returned `secret`.
