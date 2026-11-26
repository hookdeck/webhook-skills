# Clio Webhooks - FastAPI Example

Minimal example of receiving Clio webhooks with the `X-Hook-Secret` activation
handshake and `X-Hook-Signature` (HMAC-SHA256) verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Clio webhook created via `POST /api/v4/webhooks.json` (see the skill's
  `references/setup.md`)

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Clio shared secret to `.env` as `CLIO_WEBHOOK_SECRET`. Clio delivers
   this secret in the `X-Hook-Secret` header during the activation handshake —
   store it after confirming the handshake.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the tests:

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

Create a Clio source in Hookdeck Event Gateway and forward it to your local server,
where `clio` is the source's name:

```bash
hookdeck listen 8000 clio --path /webhooks/clio
```

Point your Clio webhook's `url` at the source URL. Event Gateway answers the
handshake itself, so read the secret from the webhook's `shared_secret` field
(`GET /api/v4/webhooks/{id}.json?fields=shared_secret`).

## How It Works

- **Handshake** — A POST carrying an `X-Hook-Secret` header is Clio's activation
  request. The handler echoes the header back with `200 OK`; the webhook is not
  enabled until this succeeds.
- **Events** — Signed POSTs carry `X-Hook-Signature`, the HMAC-SHA256 digest
  of the raw body (read via `await request.body()`). The handler verifies it
  before processing.

## Endpoint

- `POST /webhooks/clio` - Handles the handshake and verifies + processes events
