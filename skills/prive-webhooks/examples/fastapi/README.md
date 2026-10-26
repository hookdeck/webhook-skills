# Prive Webhooks - FastAPI Example

Minimal example of receiving Prive (now Recurly Commerce) webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Prive merchant account and the secret token Prive provides (ask Prive support if you don't have it)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Prive secret token to `.env` as `PRIVE_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

Endpoints:

- `POST /webhooks/prive` - verifies the signature; topic not identified
- `POST /webhooks/prive/{topic_slug}` - one path per topic, e.g. `/webhooks/prive/billing-attempts-failed`

Prive documents no topic header or body field, so create one Prive webhook per topic and point each at its own path. The slug-to-topic map is `TOPICS` in `main.py`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Prive's algorithm (base64 HMAC-SHA256 of the raw body).

### Receive live webhooks locally

```bash
npx hookdeck-cli listen 8000 prive --path /webhooks/prive
```

## Verification note

Both sides of the signature comparison are encoded to bytes before `hmac.compare_digest`, so a non-ASCII header returns 401 instead of raising a `TypeError`.
