# Cyera Webhooks - FastAPI Example

Minimal example of receiving Cyera Privacy webhooks (privacy requests, health checks, readiness checks) with signature verification using FastAPI.

## Prerequisites

- Python 3.10+
- A Cyera Privacy webhook integration and its Webhook Secret

## Setup

1. Create virtual environment:
   ```bash
   python3 -m venv venv
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

4. Add your Cyera Webhook Secret to `.env` as `CYERA_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/cyera`.

## Test

Run the automated tests (they generate real signatures with Cyera's algorithm):

```bash
pytest test_webhook.py -v
```

To receive real deliveries locally, run the Hookdeck CLI (no install required, no account needed) and paste the URL it prints into the Cyera Privacy webhook integration:

```bash
npx hookdeck-cli listen 8000 cyera --path /webhooks/cyera
```

## How verification works

- Header `X-Webhook-Signature`: standard padded base64 of HMAC-SHA256
- Signed message: `{X-Webhook-Timestamp}:{raw body}` (colon separator, raw bytes)
- Key: the Webhook Secret's UTF-8 bytes, used as-is
- The `verified_body` dependency reads `await request.body()` and verifies the exact bytes before any JSON parsing
- Responses: `401` for bad signatures, `201` for created access/deletion/opt-out requests, `200` for health and readiness checks
- Optional replay window: set `CYERA_WEBHOOK_TOLERANCE_SECONDS` (off by default; leave it off behind Hookdeck, which replays the original timestamp)
