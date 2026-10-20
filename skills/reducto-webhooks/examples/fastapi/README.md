# Reducto Webhooks - FastAPI Example

Minimal example of receiving Reducto async job webhooks (delivered via Svix) with
signature verification using the official `svix` SDK.

## Prerequisites

- Python 3.10+
- Reducto account with a Svix endpoint signing secret (`whsec_...`) from Reducto Studio → **Webhooks**

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env` as `REDUCTO_WEBHOOK_SECRET`

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

Webhook endpoint: `POST http://localhost:8000/webhooks/reducto`

## Test

```bash
pytest test_webhook.py -v
```

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 reducto --path /webhooks/reducto
```

Add the printed URL as an endpoint in the Svix dashboard (Reducto Studio →
**Webhooks** → **+ Add Endpoint**), then submit an async job with
`async.webhook.mode = "svix"`. When the job finishes you'll receive an
`async.update` webhook with `status` `Completed` or `Failed`.
