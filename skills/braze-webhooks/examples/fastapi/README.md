# Braze Webhooks - FastAPI Example

Minimal example of receiving Braze webhooks and authenticating them with the Basic
authentication credential Braze sends.

Braze does not sign webhooks, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)` and compares the username and password each in
constant time. The route reads the body with `await request.body()`, so any content type works. It accepts `POST`, `PUT`, `PATCH`, `GET` and `DELETE` (the marketer
chooses the method), handles an empty body, and accepts JSON or raw text bodies.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Braze workspace with a Basic authentication credential (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BRAZE_WEBHOOK_USERNAME` and `BRAZE_WEBHOOK_PASSWORD` to the credential's values (Settings > Credential Management).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and serves `/webhooks/braze`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every supported method with correct, wrong, missing and malformed credentials, and
with JSON, text and empty bodies. No Braze account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/braze \
  -u "$BRAZE_WEBHOOK_USERNAME:$BRAZE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"message_body":"Your order just arrived!","user_id":"u_123"}'
```

## Receive Webhooks Locally

Braze can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 braze --path /webhooks/braze
```

Put the printed URL in the Braze webhook composer and select your credential.

## How It Works

- `main.py`: `verify_braze_request()`, a `require_braze_basic_auth` dependency and the `/webhooks/braze` route

1. The method must be one of the five above.
2. The `Authorization` header is checked before the body is parsed. Failure returns `401`.
3. The body is classified as JSON, raw text or empty and passed to the handler. Braze adds no
   event field, so the example logs the body; replace the `TODO`s with your logic.
4. It returns `200 {"received": true}`.
