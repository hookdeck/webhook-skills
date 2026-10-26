# Texture Webhooks - FastAPI Example

Minimal example of receiving Texture webhooks with `Texture-Signature` verification.

Texture signs each delivery with the lowercase hex HMAC-SHA256 of the raw request body, keyed
with the destination's `secret`. Paste the whole secret, including the whsec_ prefix. Texture
uses it as a plain HMAC key. It is not a Standard Webhooks key, so don't use the `svix` or
`standardwebhooks` libraries.

## Prerequisites

- Python 3.10+
- A Texture webhook destination and its `secret`

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

3. Set `TEXTURE_WEBHOOK_SECRET` to the destination's whole secret in `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/texture`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads with the same algorithm as Texture.

## Receive Texture Webhooks Locally

```bash
npx hookdeck-cli listen 8000 texture --path /webhooks/texture
```

Use the printed URL as the destination URL in Texture.

## How It Works

- `verify_texture_signature()` checks the signature; `verified_body` is a FastAPI dependency.

1. The dependency reads the raw bytes with `await request.body()`, whatever the content type.
2. `Texture-Signature` must be 64 hex characters; it is compared with `hmac.compare_digest` on
   bytes. Failure returns `401`.
3. The route parses JSON only after verification (`400` if it is not a JSON object).
4. The handler dispatches on `type` (`device.updated`, `command.succeeded`, ...) and logs the rest.

`Texture-Timestamp` is not signed, so the example does not use it. Dedupe on the event `key`.
