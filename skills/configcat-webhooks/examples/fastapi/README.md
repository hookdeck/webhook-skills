# ConfigCat Webhooks - FastAPI Example

Minimal example of receiving ConfigCat webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A ConfigCat account with a webhook and its signing key

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

3. Add your ConfigCat signing key to `.env` as `CONFIGCAT_WEBHOOK_SECRET`, pasted **whole** including the `configcat_whsk_` prefix. Keep a single signing key on the webhook: with two keys ConfigCat sends two signatures and verification fails.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The route is `/webhooks/configcat` and accepts GET, POST, PUT, PATCH and DELETE (ConfigCat webhooks use GET or POST, set per webhook).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same algorithm as ConfigCat (including the vector from ConfigCat's docs).

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 configcat --path /webhooks/configcat
```

Then use the printed URL as the webhook URL in ConfigCat. If the webhook uses GET, also allow GET on the Hookdeck source.
