# SMTP2GO Webhooks - FastAPI Example

Minimal example of receiving SMTP2GO email and SMS webhooks and authenticating them with the
`Authorization` header.

SMTP2GO does not sign payloads. The only credential is the optional Authorization header set on
the webhook. The handler compares the **whole header value**, including the `Bearer ` or `Basic `
prefix, with a constant-time comparison. A static credential authenticates the sender, not the
body, and gives no replay protection, so use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- An SMTP2GO account

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

3. Set an Authorization header on the SMTP2GO webhook and paste the full value, including the "Bearer " or "Basic " prefix.
   Capture one delivery to see exactly what arrives, then set `SMTP2GO_AUTHORIZATION` to that value
   (see [../../references/setup.md](../../references/setup.md)).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/smtp2go`.

## Test

```bash
pytest test_webhook.py
```

The tests send email and SMS events as JSON and form-encoded bodies with correct, wrong and
missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/smtp2go \
  -H "Content-Type: application/json" \
  -H "Authorization: $SMTP2GO_AUTHORIZATION" \
  -d '{"event":"delivered","rcpt":"user@example.com","email_id":"1abcDE-ABC123-xy"}'
```

## Receive SMTP2GO Webhooks Locally

```bash
npx hookdeck-cli listen 8000 smtp2go --path /webhooks/smtp2go
```

Use the printed URL as the SMTP2GO webhook URL.

## How It Works

- `main.py`: `verify_smtp2go_request()`, the `require_smtp2go_auth` dependency, `parse_body()` and the `POST /webhooks/smtp2go` route

1. The `require_smtp2go_auth` dependency compares `Authorization` with `SMTP2GO_AUTHORIZATION` before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON or form encoded (`400` if neither parses).
