# Maximizer Webhooks - FastAPI Example

Minimal example of receiving Maximizer CRM webhooks and authenticating them with the secret
header you configure on the target.

Maximizer does not sign payloads, so there is no HMAC to verify. The handler looks up the header
named in `MAXIMIZER_WEBHOOK_HEADER` (default `Authorization`, case-insensitive) and compares its
**whole** value with `MAXIMIZER_WEBHOOK_SECRET` in constant time. That authenticates the sender
only: it doesn't cover the body and gives no replay protection, so use HTTPS and rotate the secret
if it leaks. The route reads the body with `await request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A Maximizer CRM instance and an administrator token (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MAXIMIZER_WEBHOOK_HEADER` and `MAXIMIZER_WEBHOOK_SECRET` to the `Key` and exact `Value`
   you put in the target's `Endpoint.Headers`.

## Run

```bash
uvicorn main
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/maximizer`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every handled event with correct, wrong and missing credentials. No Maximizer
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/maximizer \
  -H "Content-Type: application/json" \
  -H "$MAXIMIZER_WEBHOOK_HEADER: $MAXIMIZER_WEBHOOK_SECRET" \
  -d '[{"Id":"1","Entity":"Opportunity","Data":{"Op":"Update","Original":{"Key":"k"},"New":{"Key":"k"},"Version":"1.1"}}]'
```

## Receive Webhooks Locally

Maximizer can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 maximizer --path /webhooks/maximizer
```

Use the printed URL as the target's `Endpoint.Url`.

## How It Works

- `app --port 8000:main.py`: the credential check plus the `POST /webhooks/maximizer` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON array of objects (`400` otherwise).
3. Each webhook is dispatched on `Entity` and `Data.Op`: `AbEntry`, `Opportunity` and `Lead`
   with `Create`, `Update` or `Delete`. Other combinations are acknowledged and logged.
4. It returns `200 {"received": true}`. Maximizer needs a 200 within 2 seconds, so keep slow work
   off the request path.
