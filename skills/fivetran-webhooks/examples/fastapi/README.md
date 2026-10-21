# Fivetran Webhooks - FastAPI Example

Minimal example of receiving Fivetran webhooks with signature verification (`X-Fivetran-Signature-256`, HMAC-SHA256 hex of the raw body). Fivetran has no verification SDK, so verification is manual.

## Prerequisites

- Python 3.9+
- Fivetran account with REST API credentials, and a webhook created with a `secret`

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

3. Set `FIVETRAN_WEBHOOK_SECRET` in `.env` to the `secret` you pass when creating the webhook (Fivetran only signs payloads when a secret is set)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Receive real webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 fivetran --path /webhooks/fivetran
```

Start the server and the CLI **before** creating the webhook: Fivetran sends a test POST at creation and refuses to create the webhook unless your endpoint returns 2xx. Then create it with the REST API (see [references/setup.md](../../references/setup.md)), using the Hookdeck URL as `url`, and fire a test event:

```bash
POST https://api.fivetran.com/v1/webhooks/{webhook_id}/test   {"event": "sync_end"}
```

## Endpoint

- `POST /webhooks/fivetran` - Receives and verifies Fivetran webhook events
