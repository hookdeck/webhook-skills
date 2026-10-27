# Taskade Webhooks - FastAPI Example

Minimal example of receiving Taskade webhooks with signature verification.

> Only webhooks registered through the Taskade public API (Pro plan and above) are supported. Legacy webhooks are unsigned and fail verification.

## Prerequisites

- Python 3.9+
- Taskade Pro (or above) account with a webhook registered through the public API (`POST /api/v2/webhooks`) and its signing secret

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

3. Add the signing `secret` from the registration response to `.env` as `TASKADE_WEBHOOK_SECRET` (Taskade shows it only once)

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
npx hookdeck-cli listen 8000 taskade --path /webhooks/taskade
```

Then use the Hookdeck URL as the webhook target when registering with Taskade.

### Trigger Test Events

Trigger a registered event (for example `task.assigned`) in a workspace the webhook is scoped to.

## Endpoint

- `POST /webhooks/taskade` - Receives and verifies Taskade webhook events (`X-Taskade-Signature`). Reads `await request.body()` so the signature is checked against the raw bytes.
