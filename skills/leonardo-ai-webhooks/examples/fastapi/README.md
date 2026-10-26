# Leonardo.Ai Webhooks - FastAPI Example

Minimal example of receiving Leonardo.Ai webhook callbacks with FastAPI and authenticating them
with the `Authorization: Bearer` header.

Leonardo.Ai does not sign payloads. A FastAPI dependency checks the header is
`Bearer <webhook callback API key>` (scheme matched case-insensitively) and compares the key with
your stored secret using `hmac.compare_digest` on bytes. The handler reads the raw body, so any
content type works.

A static shared credential authenticates the sender, not the body, and gives no replay
protection. Use HTTPS and rotate the key if it leaks.

## Prerequisites

- Python 3.9+
- A Leonardo.Ai production API key with a webhook callback URL and callback API key (see [../../references/setup.md](../../references/setup.md))

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

3. Set `LEONARDO_AI_WEBHOOK_SECRET` to the webhook callback API key (the bare key, without `Bearer `).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/leonardo-ai`.

## Test

```bash
pytest test_webhook.py -v
```

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/leonardo-ai \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEONARDO_AI_WEBHOOK_SECRET" \
  -d '{"type":"image_generation.complete","object":"generation","timestamp":1699490546932,"api_version":"v1","data":{"object":{"id":"gen-1","status":"COMPLETE","images":[]}}}'
```

## Receive Webhooks Locally

Leonardo.Ai can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 leonardo-ai --path /webhooks/leonardo-ai
```

Use the printed URL as the webhook callback URL on the production API key.

## How It Works

- `main.py`: `verify_leonardo_request()`, the `require_leonardo_key` dependency and the route

1. The dependency checks `Authorization` before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `type`; `image_generation.complete` is handled, other types are acknowledged.
4. It returns `200 {"received": true}`.
