# Bump.sh Webhooks - FastAPI Example

Minimal example of receiving Bump.sh webhooks with signature verification using FastAPI. Bump.sh has no webhook SDK, so the `X-Bump-Signature-256` HMAC is verified **manually** with Python's `hmac` module.

## Prerequisites

- Python 3.9+
- A Bump.sh webhook with its secret token

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

3. Add your Bump.sh webhook secret token to `.env`:
   ```bash
   BUMP_SH_WEBHOOK_SECRET=your_secret_token
   ```
   You can find it on the webhook's confirmation screen in the **Integrations** tab of your documentation.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 with the webhook endpoint at `POST /webhooks/bump-sh`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Bump.sh webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 bump-sh --path /webhooks/bump-sh
```

Use the public URL the CLI prints as the webhook's payload URL in the Bump.sh Integrations tab, then use **Test Webhook** in the **Recent deliveries** section.

## How It Works

- The route reads `await request.body()` so the exact bytes are verified for any content type (parsing JSON first would break the signature).
- `verify_bump_signature()` strips an optional `sha256=` prefix, checks the value is exactly 64 hex characters, recomputes the HMAC-SHA256 over the raw bytes and compares with `hmac.compare_digest` on bytes. Nothing else is signed, so there is no timestamp check.
- A missing, empty, malformed or mismatched signature returns `401`.
- After verification the body is parsed. Bump.sh has one notification (an API documentation structure change, body `{api, diff}`), and `api`/`diff` are type-checked before use, so a wrong-typed field never causes a `500`.
