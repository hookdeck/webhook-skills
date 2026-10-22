# Codat Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Codat](https://www.codat.io) webhooks with signature verification. Codat delivers webhooks through Svix, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` (Standard Webhooks names, not `svix-*`) headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package (the Svix-maintained reference implementation of the same scheme). Verification runs in a FastAPI dependency (`verified_codat_event`).

## Prerequisites

- Python 3.9+
- A Codat account with access to the Codat Portal (**Monitor > Webhooks**)
- The signing secret (`whsec_...`) of your webhook endpoint

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

3. Put your endpoint's signing secret in `CODAT_WEBHOOK_SECRET`. Copy it from the Codat Portal: **Monitor > Webhooks > Events**, click the endpoint, copy the **Signing secret** (see [setup](../../references/setup.md)). Each endpoint has its own secret.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/codat`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Svix does and cover tampered bodies, stale timestamps, multiple signatures, another endpoint's secret, an undecoded key, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 codat --path /webhooks/codat
```

Add the printed URL as an endpoint in the Codat Portal (**Monitor > Webhooks > Events**) and select event types such as `company.created`, `connection.connected` and `read.completed`.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- If `CODAT_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
-  The handler dedupes on the `webhook-id` header, which stays the same across retries.
- Return a `2xx` quickly. Enqueue the event and process it asynchronously in production.
