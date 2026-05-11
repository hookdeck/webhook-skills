# Linear Webhooks - FastAPI Example

Minimal Linear webhook handler in Python using FastAPI. Verifies the `Linear-Signature` HMAC-SHA256 header against the raw request body and enforces the 1 minute `webhookTimestamp` freshness window.

## Prerequisites

- Python 3.9+
- A Linear workspace with a webhook configured (see [setup guide](../../references/setup.md))

## Setup

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Linear webhook signing secret to `.env`.

## Run

```bash
uvicorn main:app --port 3000 --reload
```

Server runs on http://localhost:3000.

## Test

```bash
pytest test_webhook.py -v
```

Tests generate real Linear-style HMAC-SHA256 signatures and exercise verification, freshness checks, and event routing via FastAPI's `TestClient`.

### Send a real Linear webhook

```bash
npx hookdeck-cli listen 3000 linear --path /webhooks/linear
```

Paste the printed URL into Linear → **Workspace settings → API → Webhooks**.

## Endpoints

- `POST /webhooks/linear` — Receives and verifies Linear webhook events
- `GET /health` — Health check
