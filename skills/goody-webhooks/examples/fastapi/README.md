# Goody Webhooks - FastAPI Example

Minimal example of receiving Goody webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Goody sends webhooks through Svix).

## Prerequisites

- Python 3.9+
- Goody organization admin access, with a webhook and its Signing Secret (`whsec_...`)

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

3. Add your Goody signing secret to `.env` as `GOODY_WEBHOOK_SECRET`. You'll find it on
   the webhook's configuration page (Organization > Automation API or Commerce API) in Goody.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/goody
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
npx hookdeck-cli listen 8000 goody --path /webhooks/goody
```

1. Register the tunnel URL as the Endpoint URL of a Goody webhook.
2. Copy the webhook's Signing Secret into `.env`.
3. Create a test order in the Goody sandbox to trigger `order.created`.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field (the order or order batch is under `data`), routes these
events, and acknowledges anything else with `200`:

- `order_batch.created`, `order_batch.completed` (also the docs' example spelling `gift_batch.*`)
- `order.created`, `order.gift_opened`, `order.gift_accepted`, `order.thank_you_note_added`
- `order.shipped`, `order.delivered`, `order.canceled`, `order.refunded`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
