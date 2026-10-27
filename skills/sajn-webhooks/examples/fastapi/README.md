# sajn Webhooks - FastAPI Example

Minimal example of receiving [sajn](https://sajn.se) webhooks with signature verification. sajn signs deliveries with [Standard Webhooks](https://www.standardwebhooks.com), so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. If `webhook-id` is absent it reads the `svix-*` headers instead, as Hookdeck does.

## Prerequisites

- Python 3.9+
- A sajn workspace with API access (Team plan or higher, or a sandbox organization)
- A webhook endpoint created on **API version 2026-10 or later**, and its signing secret (`whsec_...`)

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

3. Put your endpoint's signing secret in `SAJN_WEBHOOK_SECRET`. sajn returns it only when you create the webhook and when you rotate it (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/sajn`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way sajn does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, stale timestamps, multiple signatures, another endpoint's secret, retried deliveries, deliveries sent with `svix-*` headers, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 sajn --path /webhooks/sajn
```

Create the sajn webhook with the printed URL (**Inställningar > Utvecklare > Webhooks**, or `POST /api/v1/webhooks`), subscribe to events such as `document.completed`, then call `POST /api/v1/webhooks/{id}/test` to send a signed `webhook.test`.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw body bytes for any content type, so `request.json()` before verification breaks it.
- Create the sajn webhook endpoint on API version 2026-10 or later. Endpoints on the deprecated 2026-09 version sign with `X-Sajn-Signature` instead of Standard Webhooks and fail verification.
- If `SAJN_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Each retry gets a fresh timestamp from sajn, but a delivery replayed later by Hookdeck keeps its original one and is rejected. See [verification.md](../../references/verification.md) for a manual verifier where the window can be dropped.
- The handler dedupes on the event `id` (equal to `webhook-id`), which stays the same across retries. Deliveries are unordered, so compare `createdAt` before overwriting newer data.
- sajn needs a `2xx` within **30 seconds**. Enqueue the event and process it asynchronously in production.
