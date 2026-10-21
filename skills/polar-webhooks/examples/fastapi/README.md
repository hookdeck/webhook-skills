# Polar Webhooks - FastAPI Example

Minimal example of receiving Polar webhooks with Standard Webhooks signature verification using the official `polar-sdk` Python package.

## Prerequisites

- Python 3.9+
- A Polar organization with a webhook endpoint and signing secret

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Polar webhook signing secret to `.env`:
   ```bash
   POLAR_WEBHOOK_SECRET=your_webhook_signing_secret
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/polar`, served at http://localhost:8000/webhooks/polar.

## Test

Run the test suite (generates real Standard Webhooks signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required) and use the printed URL as your endpoint in the Polar dashboard:

```bash
npx hookdeck-cli listen 8000 polar --path /webhooks/polar
```

Or use Polar's first-party tunnel:

```bash
polar listen http://localhost:8000/
```

## How verification works

The handler reads the raw body via `await request.body()` and calls
`validate_event(body, dict(request.headers), secret)` from `polar.v2026_10.webhooks`
(`polar-sdk` 1.x, versioned by Polar API version). It verifies the `webhook-id` /
`webhook-timestamp` / `webhook-signature` headers (HMAC-SHA256, base64) and returns a typed
event. Pass the secret **as-is**.

- `PolarWebhookVerificationError` → the signature is invalid → return **400**.
- `PolarWebhookUnknownTypeError` → the signature is valid but this API version doesn't model the
  event type → acknowledge with a **2xx** so Polar doesn't retry and auto-disable the endpoint.
- `PolarWebhookError` (any other) → authentic but the payload doesn't parse → return **400**.

> Note: `event.type` is the event name (e.g. `order.paid`) and `event.data` is the resource (an
> `Order`, `Subscription`, etc.).

See [../../references/verification.md](../../references/verification.md) for details.
