# Airweave Webhooks - FastAPI Example

Minimal example of receiving Airweave webhooks with signature
verification using the official [`svix`](https://pypi.org/project/svix/) library
(Airweave delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- An Airweave webhook subscription and its signing secret (`whsec_...`)

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

3. Add your Airweave signing secret to `.env` as `AIRWEAVE_WEBHOOK_SECRET`. It is the `secret`
   returned by `GET /webhooks/subscriptions/{id}?include_secret=true`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/airweave
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 airweave --path /webhooks/airweave
```

1. Create a subscription (`POST https://api.airweave.ai/webhooks/subscriptions`, Bearer token, admin or
   owner role) with the tunnel URL and the event types you want, e.g.
   `["sync.completed", "sync.failed"]`.
2. Fetch the secret: `GET /webhooks/subscriptions/{id}?include_secret=true`. Copy the `secret`
   (`whsec_...`) into `.env`. If you set a custom `secret` when creating the subscription, paste the
   `whsec_` secret Airweave returns for the subscription, not the value you sent.

## Event Handling

The handler reads the event name from the top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `sync.pending`, `sync.running`, `sync.completed`, `sync.failed`, `sync.cancelled`
- `source_connection.created`, `source_connection.auth_completed`, `source_connection.deleted`
- `collection.created`, `collection.updated`, `collection.deleted`

The body carries no event id, so deduplicate on the `svix-id` header.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
