# Currents Webhooks - FastAPI Example

Minimal example of receiving Currents webhooks and authenticating them with a secret custom header.

Currents does not sign payloads, so there is no HMAC to verify. You add a secret header to the
HTTP Webhook integration; the handler compares that header's whole value with
`CURRENTS_WEBHOOK_SECRET` in constant time. The header name comes from `CURRENTS_WEBHOOK_HEADER`
(default `Authorization`). The route reads the body with `await request.body()`, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay
protection. Use HTTPS and rotate the secret if it leaks. The unsigned `x-timestamp` header can be
forged, so it is not checked.

## Prerequisites

- Python 3.9+
- A Currents project with the HTTP Webhook integration (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CURRENTS_WEBHOOK_HEADER` to the header name you added under **Manage Project > Integrations
   > HTTP Webhook > Headers**, and `CURRENTS_WEBHOOK_SECRET` to its exact value (including any
   `Bearer ` prefix you typed).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/currents`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented event with correct, wrong and missing credentials. No Currents
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/currents \
  -H "Content-Type: application/json" \
  -H "$CURRENTS_WEBHOOK_HEADER: $CURRENTS_WEBHOOK_SECRET" \
  -d '{"event":"RUN_FINISH","runUrl":"https://app.currents.dev/run/abc","buildId":"demo","tags":[],"overall":3,"passes":3,"failures":0,"pending":0,"skipped":0,"retries":0,"flaky":0}'
```

## Receive Webhooks Locally

Currents can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 currents --path /webhooks/currents
```

Put the printed URL in the Currents HTTP Webhook integration.

## How It Works

- `main.py`: `verify_currents_request()` plus the `POST /webhooks/currents` route

1. The secret header is checked before the body is parsed. A missing header or mismatch returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event` field: `RUN_START`, `RUN_FINISH`, `RUN_TIMEOUT`,
   `RUN_CANCELED`.
4. It returns `200 {"received": true}`.
