# Featurebase Webhooks - FastAPI Example

Minimal example of receiving [Featurebase](https://featurebase.app) webhooks with signature verification. Featurebase signs each delivery with a hex HMAC-SHA256 in `X-Webhook-Signature`, computed over `{X-Webhook-Timestamp}.{raw body}`. The handler verifies it with Python's `hmac` module. This is not Standard Webhooks, so the `standardwebhooks` and `svix` libraries do not apply.

## Prerequisites

- Python 3.10+
- A Featurebase workspace on the Growth plan or higher
- The signing secret (`whsec_...`) of your webhook

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

3. Put the signing secret in `FEATUREBASE_WEBHOOK_SECRET`. Paste the whole secret, including the whsec_ prefix. Featurebase uses it as a plain HMAC key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/featurebase`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads the way Featurebase does (`hex(HMAC-SHA256(secret, "{timestamp}." + raw body))`).

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 featurebase --path /webhooks/featurebase
```

Add the printed URL in **Settings → Developers → Webhooks**, select topics such as `post.created` and `comment.created`, then create a Request on your board.

## Notes

- The route reads `await request.body()` and parses JSON only after the signature check.
- Old timestamps are **not** rejected by default: Hookdeck retries and replays resend the original timestamp. Set `FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to opt in.
- Bad or missing signature returns `401`. If `FEATUREBASE_WEBHOOK_SECRET` is unset the handler returns `500`.
- Featurebase needs `200`, `201`, `202` or `204` within **5 seconds**. Enqueue the event and process it asynchronously in production.
