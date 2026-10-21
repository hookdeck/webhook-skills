# Bolt Webhooks - FastAPI Example

Minimal example of receiving Bolt webhooks with signature verification (`X-Bolt-Hmac-Sha256`, base64 HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- Bolt Merchant Dashboard account with a Signing Secret

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

3. Add your Signing Secret (Merchant Dashboard > Administration > API > Signing Secret) to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, webhook endpoint `POST /webhooks/bolt`.

## Test

Run the automated tests (they generate real signatures):

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 8000 bolt --path /webhooks/bolt
```

Then add the Hookdeck URL as a webhook endpoint under **Administration > Developers > Webhooks** in the Bolt Merchant Dashboard and complete a sandbox checkout.
