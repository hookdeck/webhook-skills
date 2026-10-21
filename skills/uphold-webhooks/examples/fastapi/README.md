# Uphold Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Uphold Enterprise](https://developer.uphold.com/rest-apis/webhooks) (Core API) webhooks with signature verification, using the official [`svix`](https://pypi.org/project/svix/) package. Uphold delivers webhooks through Svix and points to Svix's verification guide and SDKs. Verification runs in a FastAPI dependency (`verified_uphold_event`).

## Prerequisites

- Python 3.9+
- An Uphold Enterprise account (Sandbox or Production)
- The endpoint's signing secret (`whsec_...`) from the Webhooks Portal

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

3. Add your endpoint's signing secret to `UPHOLD_WEBHOOK_SECRET` (see [setup](../../references/setup.md) for where to find it).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/uphold`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the same way Uphold does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, malformed signature headers, stale timestamps, multiple signatures, `svix-*` header names, duplicate deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 uphold --path /webhooks/uphold
```

Add the printed URL as an endpoint in the Webhooks Portal, subscribe to events such as `core.user.created` and `core.transaction.status-changed`, and send a test event from the portal. In Sandbox you can also trigger real events with Uphold's [test helpers](https://developer.uphold.com/rest-apis/test-helpers).

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- In `svix` 2.x, `Webhook.verify()` returns `None` and only raises on failure. The handler parses the raw body with `json.loads` after verification.
- If `UPHOLD_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Failed deliveries are retried with exponential backoff for up to 24 hours. Dedupe on the event `id` (or the `webhook-id` header) and acknowledge quickly.
