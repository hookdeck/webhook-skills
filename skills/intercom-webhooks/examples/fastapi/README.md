# Intercom Webhooks - FastAPI Example

Minimal example of receiving Intercom webhooks with `X-Hub-Signature` HMAC-SHA1
verification, using FastAPI.

## Prerequisites

- Python 3.9+
- An Intercom app in the Developer Hub (for the `client_secret`)

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Intercom app's `client_secret` to `.env`:
   - In the Intercom Developer Hub, open your app → **Basic Information** →
     copy the **Client secret**.

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 intercom --path /webhooks/intercom
```

Use the printed URL as the **Endpoint URL** in Intercom's Developer Hub.

### Run the test suite

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/intercom` — receives and verifies Intercom notifications
- `GET /health` — health check
