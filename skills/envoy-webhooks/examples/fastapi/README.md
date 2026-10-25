# Envoy Webhooks - FastAPI Example

Minimal example of receiving Envoy webhooks with signature verification.

## Prerequisites

- Python 3.9+
- An Envoy app (Envoy dashboard → Apps) with its **client secret**

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

3. Set `ENVOY_CLIENT_SECRET` in `.env` to your Envoy app's client secret. Envoy signs every webhook with it.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/envoy`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads with `base64(HMAC-SHA256(clientSecret, rawBody))`, the same way Envoy does, and cover bad/missing/hex signatures, tampered bodies, non-JSON content types and dispatch of all 20 event topics.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 envoy --path /webhooks/envoy
```

No account required. Use the printed HTTPS URL as a **Webhook URL** on your app's Webhooks card (Envoy dashboard → Apps → Configure), select events such as `entry_sign_in` or `invite_created`, then sign a visitor in or create an invite.

## Notes

- The handler is in `main.py`.
- The body is read with `await request.body()` in a dependency, so the HMAC covers the exact bytes whatever the `Content-Type`.
- The signature is **base64**, not hex, and there is no timestamp in the signed content.
- The event name is the top-level `event` field of the JSON body.
- See [../../references/verification.md](../../references/verification.md) for details and debugging.
