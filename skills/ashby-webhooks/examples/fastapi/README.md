# Ashby Webhooks - FastAPI Example

Minimal example of receiving Ashby webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- Ashby account with a webhook configured (Admin → Integrations → Webhooks)

## Setup

1. Create virtual environment:
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

4. Add your Ashby webhook secret token to `.env` as `ASHBY_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 ashby --path /webhooks/ashby
```

Use the printed URL as the **Request URL** in your Ashby webhook settings.

### Run the tests

```bash
pytest test_webhook.py
```

## Endpoint

- `POST /webhooks/ashby` - Receives and verifies Ashby webhook events

## Notes

- The event name is in the body (`action`), not a header.
- `await request.body()` gives the raw bytes needed for signature verification.
- Return `2xx`. Ashby retries other failures up to 10 attempts, but not a `401`, `403`, `404`, `405` or `410`.
