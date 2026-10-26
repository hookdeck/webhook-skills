# Felloh Webhooks - FastAPI Example

Minimal example of receiving Felloh webhooks with signature verification.

Felloh sends the bare hex HMAC-SHA256 of the raw body in `X-Signature`, keyed with the signing key shown when you create the webhook. The route reads the bytes with `await request.body()`, verifies them, then parses the JSON.

## Prerequisites

- Python 3.9+
- A Felloh webhook with its signing key (see [../../references/setup.md](../../references/setup.md))

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

3. Add your Felloh signing key to `.env` as `FELLOH_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

The tests sign the documented transaction, refund, booking and user payloads with the real algorithm. No Felloh account is needed.

### Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 felloh --path /webhooks/felloh
```

Use the printed URL as the webhook URL in Felloh, then send a test delivery from the dashboard (it carries `X-Felloh-Test: true`).

## Endpoint

- `POST /webhooks/felloh` - Verifies `X-Signature`, then dispatches by payload shape (Felloh has no event-name field)

Responses: `200` handled, `400` body is not a JSON object, `401` missing or invalid signature, `500` handler error.
