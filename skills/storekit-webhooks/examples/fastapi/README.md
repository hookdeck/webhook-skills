# Storekit Webhooks - FastAPI Example

Minimal example of receiving Storekit webhooks with signature
verification using the official [`svix`](https://pypi.org/project/svix/) library
(Storekit delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- A Storekit webhook endpoint and its signing secret (`whsec_...`) from the embedded webhooks portal

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

3. Add your Storekit signing secret to `.env` as `STOREKIT_WEBHOOK_SECRET`. Find it on the endpoint
   in **Settings > Webhooks** in the Storekit dashboard.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/storekit
```

FastAPI reads the body with `await request.body()` before parsing, so the signed bytes are untouched.

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
npx hookdeck-cli listen 8000 storekit --path /webhooks/storekit
```

1. In the Storekit dashboard, go to **Settings > Webhooks** and add an endpoint with the tunnel URL.
2. Copy the endpoint's signing secret into `.env`.
3. Send a test event from the embedded portal and watch it arrive.

## Event Handling

The handler reads the event name from the top-level `event` field, routes these events, and
acknowledges anything else with `200`:

- `order.created.v2`, `order.created` (legacy: the bare order object, no `event` field)
- `order.accepted`, `order.rejected`, `order.canceled`, `order.preparing`, `order.ready_for_pickup`, `order.out_for_delivery`, `order.completed`
- `order.pos.dispatch.failed`, `order.rating.updated`
- `order.refund.created`, `order.refund.succeeded`, `order.refund.failed` (no `data` wrapper)
- `store.opened`, `store.closed`, `store.opening_hours.updated`
- `item.out_of_stock`
- `payments.payout.created`, `bill.payment.created`
- `payment_link.created`, `payment_link.paid`, `payment_link.refund.created`, `payment_link.refund.succeeded`, `payment_link.refund.failed`
- `printer.status.offline`, `printer.status.online`

There is no event id in the body: deduplicate on the `svix-id` header.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
