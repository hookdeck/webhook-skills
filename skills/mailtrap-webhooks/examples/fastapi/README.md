# Mailtrap Webhooks - FastAPI Example

Receives Mailtrap webhooks at `POST /webhooks/mailtrap` and verifies the
`Mailtrap-Signature` header: lowercase hex HMAC-SHA256 of the **raw request
body**, keyed with the webhook's signing secret used as a plain string.

## Prerequisites

- Python 3.9+
- A Mailtrap account with a webhook (Email API/SMTP) and its **signing secret**
  (32 hex characters, shown in the webhook's details)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook signing secret to `.env` as `MAILTRAP_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

The tests generate real signatures (`hex(HMAC_SHA256(secret, raw_body))`) and
cover JSON and JSON Lines payloads, the `soft bounce` event name, Audit Log
events, and malformed or non-ASCII signature headers (401, not 500).

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 mailtrap --path /webhooks/mailtrap
```

No account required. Paste the printed URL into the webhook URL field in
Mailtrap, then use **Run Test** to send a dummy payload.

## Notes

- The handler reads `await request.body()` (raw bytes) and verifies before
  parsing, whatever the content type.
- The secret is used as a plain UTF-8 string. Do not hex-decode it.
- `hmac.compare_digest` gets bytes on both sides, so a non-ASCII header is a 401.
- A request carries up to 500 events. The handler loops over all of them and
  dedupes on `event_id`.
- Mailtrap retries any non-200 response 40 times every 5 minutes and pauses the
  webhook if all fail.
