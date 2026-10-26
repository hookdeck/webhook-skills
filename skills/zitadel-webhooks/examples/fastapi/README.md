# ZITADEL Webhooks - FastAPI Example

Minimal example of receiving ZITADEL Actions v2 webhooks (targets with the JSON payload type) with signature verification.

## Prerequisites

- Python 3.9+
- A ZITADEL instance (cloud or self-hosted) with an Actions v2 target using `PAYLOAD_TYPE_JSON`, and its `signingKey`

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

3. Add the target's `signingKey` to `.env` (`ZITADEL_WEBHOOK_SECRET`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw bytes with `await request.body()` and verifies `ZITADEL-Signature` (`t=<unix seconds>,v1=<hex>`): HMAC-SHA256 of `<t>.<raw body>`, keyed with the signing key. It accepts the request if any `v1=` entry matches, and answers `401` otherwise. The timestamp check is off by default because retries and replays keep the original timestamp; set `ZITADEL_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 zitadel --path /webhooks/zitadel
```

Use the Hookdeck URL as the `endpoint` of your ZITADEL target. Only Actions v2 targets with the JSON payload type are supported. JWT and JWE payload types aren't.
