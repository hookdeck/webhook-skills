# Upload-Post Webhooks - FastAPI Example

Minimal example of receiving Upload-Post webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Upload-Post account with a webhook secret

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

3. Add your Upload-Post webhook secret to `.env`. Paste the whole secret, including the whsec_ prefix. Upload-Post uses it as a plain HMAC key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 upload-post --path /webhooks/upload-post
```

Then use the Hookdeck URL as your Upload-Post webhook URL.

## Endpoint

- `POST /webhooks/upload-post` - Verifies `X-Upload-Post-Signature` (`sha256=<hex>` HMAC-SHA256 of `<X-Upload-Post-Timestamp>.<raw body>`) over `await request.body()` and handles `upload_completed`, `social_account_connected`, `social_account_disconnected`, `social_account_reauth_required`, `comment_received` and `dm_received`. Invalid signatures get `401`.
- Optional `UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS` rejects old timestamps (off by default).
