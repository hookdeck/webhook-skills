# Tiltify Webhooks - FastAPI Example

Minimal example of receiving Tiltify webhooks with `X-Tiltify-Signature` verification (base64 HMAC-SHA256 over `{X-Tiltify-Timestamp}.{raw body}`).

## Prerequisites

- Python 3.10+
- A Tiltify Application with a Webhook Endpoint and a Webhook Subscription (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's **Secret Webhook Signing Key** (Webhook Endpoint > Overview) to `.env` as `TILTIFY_WEBHOOK_SECRET`. It is a 64-character hex string; paste it as-is, it is used as UTF-8 text and is not hex-decoded.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

### Run unit tests

```bash
pytest test_webhook.py -v
```

The tests include Tiltify's published worked example (the signature `4OSwlhTt0EcrlSQFlqgE18FOtT+EKX4qTJdJeC8oV/o=`), sign payloads with the real algorithm, and cover malformed signatures, missing headers, tampered and re-serialised bodies, non-JSON content types, the opt-in timestamp tolerance, and all 8 documented event types.

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 8000 tiltify --path /webhooks/tiltify
```

Use the printed URL as the Endpoint URL of your Tiltify webhook endpoint (Tiltify can't deliver to `localhost`).

## Endpoint

- `POST /webhooks/tiltify` — reads the raw body with `await request.body()` in a `Depends` dependency, verifies `X-Tiltify-Signature` (401 on failure), then dispatches on `meta.event_type`.
- `GET /health` — liveness probe.

## Replay protection

Old timestamps are accepted by default, because retries and replays resend the original headers. To reject stale requests, set `TILTIFY_WEBHOOK_TOLERANCE_SECONDS` (for example `300`).
