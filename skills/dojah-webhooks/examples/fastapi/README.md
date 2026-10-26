# Dojah Webhooks - FastAPI Example

Minimal example of receiving Dojah webhooks with signature verification (`x-dojah-signature`, HMAC-SHA256 hex of the raw body).

## Prerequisites

- Python 3.9+
- A Dojah webhook subscription and its webhook secret

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

3. Set `DOJAH_WEBHOOK_SECRET` in `.env`. Paste the webhook secret from Developers > Webhooks, not your API secret key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real signatures):

```bash
pytest test_webhook.py
```

To receive real webhooks locally, run the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 dojah --path /webhooks/dojah
```

Then subscribe the URL it prints to a Dojah service (for example `kyc_widget`).

## Notes

- The handler reads `await request.body()` so the signature is checked over the exact bytes sent.
- `hmac.compare_digest` is called on bytes, and the header format is validated first, so a non-ASCII header yields `401`, not `500`.
- A missing, empty or malformed `x-dojah-signature`, or a mismatch, returns `401`.
- Dojah has no event-name field; the handler dispatches on `verification_status`. `Completed` means finished, not passed, so it also checks `status`.
- No timestamp is signed, so there is no replay window. Key your processing on `reference_id` to stay idempotent.
