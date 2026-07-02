# Zoom Webhooks - FastAPI Example

Minimal example of receiving Zoom webhooks with signature verification and the
`endpoint.url_validation` handshake using FastAPI.

## Prerequisites

- Python 3.9+
- A Zoom app with Event Subscriptions and a Secret Token
  (see [../../references/setup.md](../../references/setup.md))

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

4. Add your Zoom app Secret Token to `.env` as `ZOOM_WEBHOOK_SECRET_TOKEN`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real Zoom signatures):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 zoom --path /webhooks/zoom
```

Use the printed URL (with the `/webhooks/zoom` path) as the Event notification
endpoint URL in the Zoom App Marketplace.

## Endpoint

- `POST /webhooks/zoom` - Verifies signatures, answers the url_validation
  handshake, and processes Zoom webhook events
