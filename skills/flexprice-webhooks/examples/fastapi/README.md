# Flexprice Webhooks - FastAPI Example

Minimal example of receiving Flexprice webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Flexprice Cloud delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Flexprice Cloud account with a webhook endpoint and its signing secret (`whsec_...`)

> **Only Flexprice Cloud signs webhooks.** Self-hosted Flexprice sends unsigned deliveries
> (unless Svix is enabled in its configuration), which fail verification here with a 400.

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

3. Add your Flexprice signing secret to `.env` as `FLEXPRICE_WEBHOOK_SECRET`. You'll find it on
   the endpoint's page under Developers > Webhooks in the Flexprice dashboard.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/flexprice
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
npx hookdeck-cli listen 8000 flexprice --path /webhooks/flexprice
```

1. Register the tunnel URL as a webhook endpoint in the Flexprice dashboard.
2. Copy the endpoint's signing secret into `.env`.
3. Create a customer to trigger `customer.created`.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `customer.created`, `customer.updated`, `customer.deleted`
- `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.plan_changed`, `subscription.cancelled`
- `invoice.update.finalized`, `invoice.update.payment`, `invoice.update.voided`, `invoice.payment.overdue`
- `payment.success`, `payment.failed`
- `wallet.credit_balance.dropped`
- `checkout.session.completed`
- `event.rejected`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
