# Fourthwall Webhooks - FastAPI Example

Minimal example of receiving Fourthwall shop webhooks with signature verification (`X-Fourthwall-Hmac-SHA256`).

## Prerequisites

- Python 3.10+
- A Fourthwall shop with its webhook secret key (Settings > For developers)

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

3. Add your Fourthwall shop secret key to `.env` as `FOURTHWALL_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

Run the automated tests (they generate real signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 fourthwall --path /webhooks/fourthwall
```

Add the Hookdeck URL as a webhook in Fourthwall (Settings > For developers), then click **Send test notification** or place a test order.

## Endpoint

- `POST /webhooks/fourthwall` - Receives and verifies Fourthwall webhook events

Verification runs in a FastAPI dependency (`verified_event`) that reads `await request.body()` before any JSON parsing.
