# Paragon Webhooks - FastAPI Example

Minimal example of receiving Paragon Webhook Destination requests and authenticating them with
a shared secret header.

Paragon does not sign payloads, so there is no HMAC to verify. You add a header to the
Webhook Destination (name and value are yours to choose) and the handler compares it with
`PARAGON_WEBHOOK_SECRET` in constant time. The route reads the body with
`await request.body()`, so any content type works, and parses JSON only after the
credential check.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Paragon project on a paid plan with a Webhook Destination (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PARAGON_WEBHOOK_HEADER` to the header name you added (default `Authorization`) and
   `PARAGON_WEBHOOK_SECRET` to the exact, whole header value, including any `Bearer ` prefix.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/paragon`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send both documented event types with correct, wrong and missing credentials. No
Paragon account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/paragon \
  -H "Content-Type: application/json" \
  -H "Authorization: $PARAGON_WEBHOOK_SECRET" \
  -d '{"type":"workflow_failure","message":"Workflow failed","data":{"error":"Test error message"}}'
```

## Receive Webhooks Locally

Paragon can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 paragon --path /webhooks/paragon
```

Put the printed URL in the Paragon Webhook Destination.

## How It Works

- `main.py`: `verify_paragon_request()`, a FastAPI dependency and the `POST /webhooks/paragon` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `type` field: `workflow_failure` or `credentials_failure`.
4. It returns `200 {"received": true}`.
