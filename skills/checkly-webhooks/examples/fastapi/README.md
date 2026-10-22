# Checkly Webhooks - FastAPI Example

Minimal example of receiving Checkly alert webhooks with signature verification.

## Prerequisites

- Python 3.10+
- Checkly account with a webhook alert channel and webhook secret

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

3. Add your Checkly webhook secret to `.env`

4. In Checkly, use a body template that includes the fields the handler reads:
   ```json
   {
     "alertType": "{{ALERT_TYPE}}",
     "checkName": "{{CHECK_NAME}}",
     "checkId": "{{CHECK_ID}}"
   }
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 checkly --path /webhooks/checkly
```

Then use the Hookdeck URL as the webhook URL in your Checkly alert channel and send a test message.

## Endpoint

- `POST /webhooks/checkly` - Receives and verifies Checkly alert webhooks (`ALERT_FAILURE`, `ALERT_RECOVERY`, `ALERT_DEGRADED`). The raw body is verified, so any content type works.
