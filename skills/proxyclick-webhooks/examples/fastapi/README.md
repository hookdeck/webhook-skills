# Proxyclick Webhooks - FastAPI Example

Minimal example of receiving Proxyclick (Eptura Visitor) webhooks and authenticating them with
HTTP Basic auth.

Proxyclick does not sign payloads. The only security option is a username and password entered
on the webhook, sent as `Authorization: Basic base64(username:password)`. The handler compares
the username and the password each in constant time, evaluating both before deciding. No event
field is documented, so the handler uses an **illustrative** body and dispatches on nothing.

## Prerequisites

- Python 3.9+
- A Proxyclick (Eptura Visitor) account with a webhook that has Basic credentials set
  (see [../../references/setup.md](../../references/setup.md))

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

3. Set `PROXYCLICK_WEBHOOK_USERNAME` and `PROXYCLICK_WEBHOOK_PASSWORD` to the credentials you
   entered on the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/proxyclick`.

## Test

```bash
pytest test_webhook.py
```

The tests send an illustrative body (not Proxyclick's documented schema) with correct, wrong and
missing Basic credentials. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/proxyclick \
  -u "$PROXYCLICK_WEBHOOK_USERNAME:$PROXYCLICK_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"visitor":{"firstName":"Ada"},"visit":{"id":"illustrative-1"}}'
```

## Receive Proxyclick Webhooks Locally

```bash
npx hookdeck-cli listen 8000 proxyclick --path /webhooks/proxyclick
```

Use the printed URL as the webhook's destination URL in Proxyclick and enter the same Basic
credentials there.

## How It Works

- `main.py`: `verify_proxyclick_request()`, the `require_proxyclick_auth` dependency and the `POST /webhooks/proxyclick` route

1. The `require_proxyclick_auth` dependency checks the Basic credentials before the body is read.
   Missing, malformed or wrong credentials return `401` with no `WWW-Authenticate` challenge.
   Comparison uses `hmac.compare_digest` on bytes.
2. The raw body is parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. It returns `200 {"received": true}`.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.
