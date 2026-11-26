# Dolby OptiView Real-time (Millicast) Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Dolby OptiView Real-time Streaming (Millicast)](https://optiview.dolby.com/docs/millicast/webhooks/) webhooks and verifying the `x-millicast-signature: sha1=<hex>` header (HMAC-SHA1 of the raw body, keyed with the base64-decoded Webhook Secret), for JSON hooks and binary JPEG thumbnail hooks.

## Prerequisites

- Python 3.9+
- A Dolby OptiView Real-time (Millicast) account with access to the Streaming Dashboard (see [setup](../../references/setup.md))

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

3. Set `MILLICAST_WEBHOOK_SECRET` to the Webhook Secret shown for the webhook in the Streaming Dashboard, exactly as shown (base64).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/millicast` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests the way Millicast's sample does. They check JSON and JPEG vectors, that a binary body decoded to text no longer verifies, a signed and a tampered JPEG thumbnail, a signature keyed with the secret as UTF-8 text instead of its decoded bytes, another secret, a tampered body, a missing header, a missing `sha1=` prefix, a secret with a trailing newline, invalid JSON, and the `500` paths for a missing or malformed secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 millicast --path /webhooks/millicast
```

Use the printed HTTPS URL as the Webhook URL (Streaming Dashboard > Webhooks > CREATE) with Feed hooks on, then start publishing a stream to get a `feeds` `started` event.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- The Webhook Secret is base64. The handler decodes it before using it as the HMAC key, as Millicast's sample does with `Buffer.from(webhookSecret, 'base64')`.
- Thumbnail hooks send the JPEG itself with `Content-Type: image/jpeg`. The HMAC covers those raw bytes, so never decode the body to a string before verifying.
- Millicast doesn't retry: "The request will not attempt a retry if the service is unavailable or returns an error code." Events are sent asynchronously, so their order isn't guaranteed.
- Renewing the secret in the dashboard can't be undone and takes effect at once. Update `MILLICAST_WEBHOOK_SECRET` at the same time.
