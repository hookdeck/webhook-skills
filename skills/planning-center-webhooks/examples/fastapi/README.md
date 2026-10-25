# Planning Center Webhooks - FastAPI Example

Minimal example of receiving Planning Center webhooks with signature verification (`X-PCO-Webhooks-Authenticity`, HMAC-SHA256).

## Prerequisites

- Python 3.9+
- A Planning Center webhook subscription and its authenticity secret

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

3. Add the subscription's **authenticity secret** to `.env` as `PLANNING_CENTER_AUTHENTICITY_SECRET`. Use it as-is: it is the HMAC key as a plain string, not hex-decoded.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Webhook endpoint: `POST http://localhost:8000/webhooks/planning-center`.

## Test

```bash
pytest test_webhook.py
```

The tests reproduce the worked example from the Planning Center docs (secret `2608ab74...`, expected signature `a0782fde...`) and cover invalid, tampered and malformed signatures.

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 planning-center --path /webhooks/planning-center
```

Then set the Hookdeck URL as the subscription URL at https://api.planningcenteronline.com/webhooks.

## How It Works

- The handler reads `await request.body()` so the signature is checked against the exact bytes received, whatever the content type.
- The expected and received hex digests are compared with `hmac.compare_digest` on bytes, so a non-ASCII header gives a 401, not a 500.
- The body is JSON:API: `data` is an array of `EventDelivery` objects with `attributes.name`, `attributes.attempt` and `attributes.payload`. `payload` is a JSON string that is parsed a second time.
- Respond `200` to acknowledge. Any other status is retried; a `410` deactivates the subscription.
