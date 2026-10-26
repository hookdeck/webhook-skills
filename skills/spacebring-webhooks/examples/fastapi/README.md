# Spacebring Webhooks - FastAPI Example

Minimal example of receiving Spacebring webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Spacebring delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Spacebring network with the API & webhooks add-on, and a webhook endpoint with its signing secret (`whsec_...`)

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

3. Add your Spacebring signing secret to `.env` as `SPACEBRING_WEBHOOK_SECRET`. You'll find it on
   the webhooks management page (Network settings > Developers > Webhooks).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/spacebring
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
npx hookdeck-cli listen 8000 spacebring --path /webhooks/spacebring
```

1. As the network owner, register the tunnel URL under Network settings > Developers > Webhooks.
2. Copy the endpoint's signing secret into `.env`.
3. Create a booking to trigger a `booking.created` event.

## Event Handling

The handler routes on the top-level `type` field and acknowledges anything else with `200`. Spacebring's
docs never show the value of `type`, so confirm it against a real delivery. These 32 documented events are routed:

- `booking.created`, `booking.updated`, `booking.deleted`, `booking.paid`
- `company.created`, `company.deleted`, `membership.created`, `membership.invited`
- `event.created`, `event.updated`, `event.deleted`, `event.canceled`, `event.ticket.created`, `event.ticket.paid`
- `shop.order.created`, `shop.order.paid`, `invoice.issued`, `benefit.application.created`, `support.ticket.created`
- `subscription.created`, `subscription.updated`, `subscription.deleted`, `subscription.purchased`
- `location.created`, `location.updated`, `location.deleted`, `resource.created`, `resource.updated`, `resource.deleted`
- `visitors.request.approved`, `visitors.visit.checked_in`, `visitors.visit.checked_out`

`subscription.*` bodies are the bare subscription object and `visitors.*` bodies carry `visit` only, so those
may have no `type`; the handler still verifies them and returns `200`.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
