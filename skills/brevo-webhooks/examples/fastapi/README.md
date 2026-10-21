# Brevo Webhooks - FastAPI Example

Minimal example of receiving Brevo (formerly Sendinblue) webhooks with
authentication and event handling.

> **Brevo does not sign webhook payloads.** There is no signature header to
> verify. Instead, this example checks the `Authorization` header that Brevo
> sends when the webhook is created with Basic auth credentials in the URL or
> with a bearer token, comparing credentials timing-safe. Add Brevo's IP
> allowlist at your firewall or proxy for defense in depth.

## Prerequisites

- Python 3.9+
- Brevo account with access to webhooks (Transactional or Marketing)

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set the credentials that match your Brevo webhook:
   - **Basic auth**: `BREVO_WEBHOOK_USERNAME` and `BREVO_WEBHOOK_PASSWORD`, and create the
     webhook with URL `https://username:password@your-domain.com/webhooks/brevo`
   - **Bearer token**: `BREVO_WEBHOOK_TOKEN`, and create the webhook with
     `"auth": {"type": "bearer", "token": "<token>"}`

   If neither is set, the endpoint returns `500` (fails closed).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests:

```bash
pytest test_webhook.py -v
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 brevo --path /webhooks/brevo
```

Use the Hookdeck URL as your Brevo notify URL (add `username:password@` after
`https://` for Basic auth), then send a transactional email to trigger events.

Send a request manually:

```bash
curl -X POST http://localhost:8000/webhooks/brevo \
  -u "your_webhook_username:your_webhook_password" \
  -H "Content-Type: application/json" \
  -d '{"event":"delivered","email":"example@domain.com","id":26224,"message-id":"<abc@domain.com>","ts_event":1604933654}'
```

## Endpoint

- `POST /webhooks/brevo` - Authenticates the request, accepts single or batched events, dispatches on `event`
