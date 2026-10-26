# Flux CD Webhooks - FastAPI Example

Minimal example of receiving Flux CD webhooks with signature verification (`X-Signature`, HMAC-SHA256 over the raw body).

## Prerequisites

- Python 3.9+
- A Flux cluster with a notification-controller `Provider` of type `generic-hmac`, and the `token` from its Secret

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the Secret's `token` value to `.env` as `FLUX_CD_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/flux-cd`.

The route reads the raw bytes with `await request.body()` and parses the JSON only after the signature check.

## Test

Run the unit tests (they generate real signatures):

```bash
pytest test_webhook.py
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 flux-cd --path /webhooks/flux-cd
```

Then set the Hookdeck URL as the Provider's `spec.address` (see the skill's `references/setup.md`). A Provider of type `generic` is unsigned and fails verification; use `generic-hmac`.
