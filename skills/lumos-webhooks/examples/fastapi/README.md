# Lumos Webhooks - FastAPI Example

Minimal example of receiving Lumos provisioning and deprovisioning webhooks and
authenticating them with a custom header you add in Lumos.

Lumos also signs each request (HMAC-SHA256 in `X-Lumos-Webhook-Signature`), but the header
format is in a login-gated help article, so **this example does not verify that signature**. It
checks the custom header instead. A static shared credential authenticates the sender, not the
body, and gives no replay protection, so use HTTPS and rotate the credential if it leaks.

The header name comes from `LUMOS_WEBHOOK_HEADER` (default `Authorization`) and the expected
value from `LUMOS_WEBHOOK_SECRET`. The whole value is compared in constant time, including any
`Bearer ` prefix you typed in Lumos. The route reads the body with `await request.body()`,
so any content type works.

> Use notification webhooks such as provisioning and deprovisioning. Pre-approval and request validation webhooks expect a decision back and aren't supported.

## Prerequisites

- Python 3.9+
- A Lumos webhook with a custom header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LUMOS_WEBHOOK_HEADER` and `LUMOS_WEBHOOK_SECRET` to match the custom header on the Lumos webhook.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/lumos`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send an illustrative payload with correct, wrong, missing and differently-named
headers. No Lumos account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/lumos \
  -H "Content-Type: application/json" \
  -H "Authorization: $LUMOS_WEBHOOK_SECRET" \
  -d '{"user":{"email":"ada@example.com"},"permissions":["Agent License"]}'
```

## Receive Webhooks Locally

Lumos can't reach `localhost` (and requires HTTPS). Tunnel to your machine with the Hookdeck CLI
(no account, no install):

```bash
npx hookdeck-cli listen 8000 lumos --path /webhooks/lumos
```

Put the printed URL in the Lumos webhook.

## How It Works

- `main.py`: `verify_lumos_request()` plus the `POST /webhooks/lumos` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler logs the user and permissions. The payload field names are illustrative; Lumos
   doesn't publish them.
4. It returns `200 {"received": true}`.
