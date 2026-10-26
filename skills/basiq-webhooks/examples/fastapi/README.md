# Basiq Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Basiq](https://basiq.io) webhooks with signature verification. Basiq signs deliveries with [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp`, `webhook-signature`), so the handler verifies them with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. Verification runs in a FastAPI dependency (`verified_basiq_event`).

## Prerequisites

- Python 3.9+
- A Basiq account and application, with a webhook subscription whose signing secret (`whsec_...`) you can read

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

3. Put your endpoint's signing secret, including the `whsec_` prefix, in `BASIQ_WEBHOOK_SECRET` (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/basiq`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Standard Webhooks does and cover every documented event type, tampered and re-serialised bodies, stale timestamps, multiple signatures, another endpoint's secret, an undecoded key, repeated deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 basiq --path /webhooks/basiq
```

Create a Basiq webhook subscription (`POST /notifications/webhooks`) with the printed URL, then send a test message with `POST /notifications/messages/test`.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw body, so `request.json()` before verification breaks it.
- The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones are rejected. For a configurable window, use the manual verifier in [references/verification.md](../../references/verification.md).
- If `BASIQ_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The handler dedupes on the `webhook-id` header.
- Basiq notifications are thin (`eventTypeId`, `eventId`, `links`). Fetch `links.event` or `links.eventEntity` for the data.
- Return a `2xx` quickly. Enqueue the event and process it asynchronously in production.
