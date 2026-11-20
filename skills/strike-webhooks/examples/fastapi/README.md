# Strike Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Strike](https://strike.me) (Bitcoin/Lightning payments) webhooks: verify the `X-Webhook-Signature` HMAC-SHA256, return `200` straight away, then fetch the entity by `data.entityId` from the Strike API in a background task.

## Prerequisites

- Python 3.9+
- A Strike account with an API key (dashboard.strike.me) and a webhook subscription created with `POST /v1/subscriptions` (see [setup](../../references/setup.md))

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

3. In `.env`, set:
   - `STRIKE_WEBHOOK_SECRET`: the `secret` you passed when creating the subscription (you generate it, 10-50 characters, e.g. `openssl rand -hex 24`). This verifies deliveries.
   - `STRIKE_API_KEY`: your Strike API key. It is only used for the fetch-back call, never for verification.
   - `STRIKE_WEBHOOK_SECRET_PREVIOUS`: optional, the old secret while you rotate.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/strike` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with HMAC-SHA256 and check: a valid signature (and the background fetch-back path), all 14 documented event types, an unknown event type (200), dedupe on `id`, a `v2` payload, a `*.created` event without `data.changes`, the previous secret during rotation, the API key used as the key (401), a tampered body, missing and wrong-length headers (401), a missing secret (401), invalid JSON (400), and the API path for each event family.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 strike --path /webhooks/strike
```

Use the printed URL as `webhookUrl` when you create the subscription (`POST /v1/subscriptions`), then trigger an event, for example by creating an invoice in the Strike sandbox.

## Notes

- The handler reads `await request.body()` and verifies those bytes before parsing. Don't verify a re-serialised `json.dumps(...)` of the parsed body.
- Strike cancels a delivery that takes longer than 5 seconds. `BackgroundTasks` runs the fetch-back after the response is sent. For heavy work, hand off to a queue.
- `410` or `501` tells Strike to stop retrying. Don't return either by accident.
- The in-memory dedupe set is for the demo. Use a unique constraint on the event `id` in your database.
