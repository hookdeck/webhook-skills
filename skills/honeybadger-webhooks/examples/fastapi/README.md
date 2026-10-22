# Honeybadger Webhooks - FastAPI Example

Minimal example of receiving Honeybadger webhooks and authenticating them with the
`Honeybadger-Token` header.

Honeybadger does not sign payloads, so there is no HMAC to verify. The handler compares the
`Honeybadger-Token` header with your project token using a constant-time comparison. The route
reads the body with `await request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A Honeybadger project with the Webhook integration (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HONEYBADGER_TOKEN` to the token on the project's **API Key** tab in Project Settings.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/honeybadger`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented event with correct, wrong and missing tokens. No Honeybadger
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/honeybadger \
  -H "Content-Type: application/json" \
  -H "Honeybadger-Token: $HONEYBADGER_TOKEN" \
  -d '{"event":"occurred","message":"[App/test] RuntimeError - oops","fault":{"id":1,"klass":"RuntimeError"}}'
```

## Receive Webhooks Locally

Honeybadger can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 honeybadger --path /webhooks/honeybadger
```

Put the printed URL in the Honeybadger Webhook integration.

## How It Works

- `main.py`: `verifyHoneybadgerRequest()` plus the `POST /webhooks/honeybadger` route

1. The `Honeybadger-Token` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event` field: `occurred`, `resolved`, `unresolved`, `assigned`,
   `commented`, `rate_exceeded`, `volume_spike`, `deployed`, `down`, `up`, `cert_will_expire`,
   `check_in_missing`, `check_in_reporting`.
4. It returns `200 {"received": true}`.

The optional `Authorization: Bearer` field in the integration settings is not used.
