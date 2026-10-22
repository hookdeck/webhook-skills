# DatoCMS Webhooks - FastAPI Example

Minimal example of receiving DatoCMS webhooks and authenticating them with HTTP Basic auth.

DatoCMS does not sign payloads, so there is no HMAC to verify. A FastAPI dependency decodes the
`Authorization: Basic` header and compares the username and password with the ones you set on the
webhook using `hmac.compare_digest` on bytes. The route reads the raw body, so any content type
works, and parses JSON only after the credential check.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Use HTTPS and rotate the credentials if they leak.

## Prerequisites

- Python 3.9+
- A DatoCMS project (see [../../references/setup.md](../../references/setup.md))

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

3. Set `DATOCMS_WEBHOOK_USERNAME` and `DATOCMS_WEBHOOK_PASSWORD` to the HTTP basic auth
   credentials you enter on the webhook in DatoCMS.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/datocms`.

## Test

```bash
pytest test_webhook.py
```

The tests send every documented `entity_type`/`event_type` pair with correct, wrong and missing
credentials. No DatoCMS account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/datocms \
  -u "$DATOCMS_WEBHOOK_USERNAME:$DATOCMS_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"entity_type":"item","event_type":"publish","entity":{"id":"1","type":"item"}}'
```

## Receive Webhooks Locally

DatoCMS can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 datocms --path /webhooks/datocms
```

Put the printed URL, with the same username and password, in the DatoCMS webhook.

## How It Works

- `main.py`: `verify_datocms_request()`, the `require_datocms_credentials` dependency and the route

1. The Basic credentials are checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `entity_type` + `event_type`.
4. It returns `200 {"received": true}`.
