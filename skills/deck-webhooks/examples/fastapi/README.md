# Deck Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Deck](https://deck.co) webhooks with Standard Webhooks signature verification, using the official [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. Verification runs in a FastAPI dependency (`verified_deck_event`).

## Prerequisites

- Python 3.9+
- A Deck account and API key (`sk_live_...`)
- A signing secret **you generate** (Deck doesn't issue one):
  ```bash
  python3 -c "import base64, os; print('whsec_' + base64.b64encode(os.urandom(32)).decode())"
  ```

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

3. Put your generated secret in `DECK_WEBHOOK_SECRET`. Use the **same** value as `webhook.secret` when you create the destination (see [setup](../../references/setup.md)). Deck can't show it to you again later.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/deck`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Deck's algorithm and cover tampered bodies, malformed signature headers, stale timestamps, multiple signatures, secret rotation, duplicate deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 deck --path /webhooks/deck
```

Use the printed URL as `webhook.url` when creating the Deck destination. Once it is `active`, use **Send test ping** in the Deck Console (or `POST /v2/event-destinations/{id}/test`) to send a `test.ping`.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- If `DECK_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- `DECK_WEBHOOK_SECRET_PREVIOUS` is optional. During a rotation Deck keeps the old secret valid for 24 hours, so the handler tries the current secret first and then the previous one.
- Deck needs a `2xx` within **5 seconds**. Enqueue the event and process it asynchronously in production.
