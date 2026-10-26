# Circleback Webhooks - FastAPI Example

Minimal example of receiving Circleback meeting webhooks with `x-signature`
verification (hex HMAC-SHA256 of the raw body).

Circleback has no SDK for verification, so this example verifies manually using
`hmac.compare_digest` on bytes. The route reads `await request.body()` so the
signed bytes are untouched.

## Prerequisites

- Python 3.10+
- A Circleback automation with a **Send webhook request** step and its signing secret

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

3. Add the signing secret from the automation's webhook step to `.env` as `CIRCLEBACK_SIGNING_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/circleback`.

## Test

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 8000 circleback --path /webhooks/circleback
```

Use the URL the CLI prints as the endpoint in the automation's webhook step, then
send a test request for your most recent meeting.

## What the handler does

Circleback has no event types: every delivery is one meeting export. The handler
logs the meeting name, link, notes, action items and transcript length.

| Status | When |
|--------|------|
| `200` | Signature valid, payload handled |
| `400` | Valid signature but the body is not JSON |
| `401` | Missing or invalid `x-signature` |
| `500` | `CIRCLEBACK_SIGNING_SECRET` not set, or the handler threw |

Circleback sends no delivery ID header, so deduplicate on the meeting `id`.
