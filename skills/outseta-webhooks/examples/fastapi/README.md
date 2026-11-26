# Outseta Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Outseta](https://go.outseta.com/support/kb/articles/Rm85R5Q4/secure-and-verify-webhooks-with-a-sha256-signature) webhooks and verifying the `x-hub-signature-256: sha256=<hex>` header (HMAC-SHA256 of the raw body, keyed with the hex-decoded Webhook Signature Key).

## Prerequisites

- Python 3.9+
- An Outseta account with access to Settings > Notifications (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a key with `openssl rand -hex 32`, add it in Outseta under Settings > Notifications, and set `OUTSETA_WEBHOOK_SIGNATURE_KEY` to the same 64-character hex string.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/outseta` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests the way Outseta's sample does. They check a fixed vector, a signature keyed with the key as UTF-8 text, the hex key decoded as base64 (48 wrong bytes), another key, a tampered body, a missing header, a missing `sha256=` prefix, a key with a trailing newline, invalid JSON, and the `500` paths for a missing key or a base64 key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 outseta --path /webhooks/outseta
```

Use the printed HTTPS URL as the notification's callback URL (for example for Person Login), then log in to your site.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- The Webhook Signature Key is **hex**: 32 bytes you generate (`openssl rand -hex 32`). The handler hex-decodes it, as Outseta's sample does with `Buffer.from(keyAsHex, "hex")`. A 64-character hex string is also valid base64, so decoding it as base64 gives 48 wrong bytes and every request fails.
- Outseta signs only after you add a key. Until then requests have no `x-hub-signature-256`, and this handler rejects them with `401`.
- Outseta's scheme has no timestamp, so there's nothing to check for freshness.
