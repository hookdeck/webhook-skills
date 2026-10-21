# Asaas Webhooks - FastAPI Example

Minimal example of receiving Asaas webhooks and authenticating them with the `asaas-access-token` header.

## Prerequisites

- Python 3.9+
- An Asaas account (Sandbox is fine) and a webhook `authToken` of 32-255 characters

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

3. Set `ASAAS_WEBHOOK_TOKEN` in `.env` to the same authToken you enter on the webhook in Asaas.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and listens at `POST /webhooks/asaas`.

## Test

Run the automated tests:

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, start a tunnel:

```bash
npx hookdeck-cli listen 8000 asaas --path /webhooks/asaas
```

Use the printed URL as the webhook URL in Asaas (User menu > Integrations > Webhooks), then create a charge in the Sandbox. Or send one by hand:

```bash
curl -X POST http://localhost:8000/webhooks/asaas \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" \
  -d '{"id":"evt_1","event":"PAYMENT_RECEIVED","payment":{"id":"pay_1","value":100}}'
```
