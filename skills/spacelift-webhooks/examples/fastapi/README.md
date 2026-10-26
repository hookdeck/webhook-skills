# Spacelift Webhooks - FastAPI Example

Minimal example of receiving Spacelift webhooks with signature verification.

Spacelift signs the raw body with HMAC-SHA256 and sends it in `X-Signature-256` as `sha256=<hex>`.

Set a secret on the Spacelift webhook. Without one, deliveries are unsigned and fail verification.

## Prerequisites

- Python 3.9+
- A Spacelift webhook with a secret (see [../../references/setup.md](../../references/setup.md))

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

3. Set `SPACELIFT_WEBHOOK_SECRET` to the secret you entered on the Spacelift webhook.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts `GET`, `POST`, `PUT`, `PATCH` and `DELETE` at `/webhooks/spacelift` (Spacelift doesn't name its method; Hookdeck's Spacelift source pre-selects POST without managing it, so allow any other method on the source too).

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads from Spacelift's docs with the real algorithm and cover valid, bare and uppercase digests, tampering, wrong secret, missing and malformed headers, every method and an empty GET body.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 spacelift --path /webhooks/spacelift
```

Use the printed URL as the webhook endpoint in Spacelift.

## How It Works

- `main.py`: `verify_spacelift_signature()` and the `/webhooks/spacelift` route

1. The body is read as bytes with `await request.body()` (any content type; empty is fine) and verified before parsing.
2. `X-Signature-256` is validated (64 hex chars, optional `sha256=`) and compared with `hmac.compare_digest` on bytes. Failure returns `401`.
3. The payload shape picks the message: `run` or `internal_error`. Stale `stateVersion`s are ignored.
