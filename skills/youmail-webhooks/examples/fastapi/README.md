# YouMail Webhooks - FastAPI Example

Minimal example of receiving YouMail Protective Services webhooks and authenticating them
with the `Authorization` header.

YouMail does not sign payloads. A webhook created with the **Bearer** auth scheme is expected to
send `Authorization: Bearer <token>` (YouMail doesn't print the header; if deliveries are
rejected, capture one and set the expected value exactly as received). The handler compares the **whole header value**, including
the `Bearer ` prefix, with a constant-time comparison. Basic auth is not covered.

> Choose the Bearer auth scheme on the YouMail webhook, not Basic, and paste the whole Authorization value, including "Bearer ".

A static credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A YouMail Protective Services API account (see [../../references/setup.md](../../references/setup.md))

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

3. Set `YOUMAIL_AUTHORIZATION` to the full header value, e.g. `Bearer <token>`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/youmail`.

## Test

```bash
pytest test_webhook.py
```

The tests send each documented payload shape with correct, wrong, Basic and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/youmail \
  -H "Content-Type: application/json" \
  -H "Authorization: $YOUMAIL_AUTHORIZATION" \
  -d '{"callEvents":[{"callEventUuid":"a1b2c3","callResult":"BLOCKED"}]}'
```

## Receive YouMail Webhooks Locally

```bash
npx hookdeck-cli listen 8000 youmail --path /webhooks/youmail
```

Use the printed URL as the webhook `url` (YouMail requires https).

## How It Works

- `main.py`: `verify_youmail_request()`, the `require_youmail_auth` dependency and the `POST /webhooks/youmail` route

1. The dependency compares `Authorization` in full with `YOUMAIL_AUTHORIZATION` (`hmac.compare_digest`
   on bytes) before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. Payloads have no type field, so the handler detects the kind by top-level keys. Better: one URL per webhook.
4. It returns `200 {"received": true}`.
