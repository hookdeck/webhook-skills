# Cloudinary Webhooks - FastAPI Example

Minimal example of receiving Cloudinary webhook notifications and verifying them
with the official `cloudinary` Python SDK.

> **Cloudinary signs with your account API Secret.** Each POST carries two
> headers — `x-cld-signature` (a hex digest) and `x-cld-timestamp` (unix seconds).
> The signature is the digest of `rawBody + timestamp + api_secret` (sha1 by
> default, or sha256 if enabled on your account). Verification uses the **raw
> request body** — this handler reads it with `await request.body()` and only
> parses the JSON after the signature checks out.

## Prerequisites

- Python 3.9+
- A Cloudinary account and its **API Secret** (Console → Settings → API Keys)

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

3. Add your Cloudinary **account API Secret** to `.env` as `CLOUDINARY_API_SECRET`.
   If your account uses sha256 signatures, also set
   `CLOUDINARY_SIGNATURE_ALGORITHM=sha256`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests:

```bash
pytest test_webhook.py -v
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 cloudinary --path /webhooks/cloudinary
```

## Endpoint

- `POST /webhooks/cloudinary` - Verifies the `x-cld-signature` / `x-cld-timestamp`
  headers against the raw body, then dispatches on `notification_type`
