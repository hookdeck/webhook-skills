# Shopware Webhooks - FastAPI Example

Minimal example of receiving Shopware app webhooks with signature verification (`shopware-shop-signature`, HMAC-SHA256 hex over the raw body, keyed with the per-shop app secret).

## Prerequisites

- Python 3.9+
- A Shopware app registered on a shop, with the app secret stored for that shop

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

3. Add the app secret for each shop to `SHOPWARE_APP_SECRETS` in `.env` (keyed by shop ID). For a single shop, `SHOPWARE_APP_SECRET` works as a fallback.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 shopware --path /webhooks/shopware
```

Then use the Hookdeck URL in your app manifest's `<webhook url="...">`.

### Automated tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/shopware` - Receives and verifies Shopware webhook events (raw body via `await request.body()`, any content type)
