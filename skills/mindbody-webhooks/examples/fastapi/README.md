# Mindbody Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Mindbody](https://www.mindbodyonline.com) webhooks and verifying the `X-Mindbody-Signature` HMAC (and answering the `HEAD` check).

## Prerequisites

- Python 3.9+
- A Mindbody developer account with live access, a linked business and a Webhooks API subscription (see [setup](../../references/setup.md))

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

3. Set `MINDBODY_MESSAGE_SIGNATURE_KEY` in `.env` to the `messageSignatureKey` from the `POST` subscription response, exactly as returned.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/mindbody` (and `HEAD` for Mindbody's URL check) in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid signature, a hex digest (rejected), a signature without the `sha256=` prefix (rejected), a key that was base64-decoded (rejected), the `HEAD` check, a second event type, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 mindbody --path /webhooks/mindbody
```

Use the printed URL as `webhookUrl` when you create the subscription, then activate it with `PATCH`. If the create call fails with `invalidWebhookURLNoResponse`, the `HEAD` check didn't get a 2xx through that URL: use a Hookdeck Mindbody source or another deployed endpoint that answers `HEAD`.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- `@app.head` answers Mindbody's URL check with `200`.
- The key is used as UTF-8 text, even though it looks like base64.
