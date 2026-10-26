# Crossmint Webhooks - FastAPI Example

Minimal example of receiving Crossmint webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Crossmint delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Crossmint project with a webhook endpoint configured and its webhook secret (`whsec_...`)

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

3. Add your Crossmint webhook secret to `.env` as `CROSSMINT_WEBHOOK_SECRET`
   (the full `whsec_...` value from the endpoint's Signing Secret section in the Crossmint console).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/crossmint
```

## Test

```bash
pytest test_webhook.py
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), and check that the `webhook-*` header names are
accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 crossmint --path /webhooks/crossmint
```

1. In the Crossmint console go to Webhooks > Add Endpoint and use the tunnel URL (staging and production consoles are separate).
2. Copy the endpoint's Signing Secret into `.env`.
3. Trigger an event, for example a staging wallet transfer for `wallets.transfer.in`.

## Event Handling

The event name is the top-level `type` in the JSON body (the envelope around it differs by product:
`id` for wallets and offramp, `actionId` for checkout V3 and minting). The handler routes these events and
logs anything else:

- `wallets.transfer.in`, `wallets.transfer.out`, `wallets.signer.exported`
- `purchase.succeeded` (Checkout V2, flat body)
- `orders.quote.created`, `orders.quote.updated`, `orders.payment.succeeded`, `orders.payment.failed`,
  `orders.delivery.initiated`, `orders.delivery.completed`, `orders.delivery.failed`
- `collections.create.succeeded`, `collections.update.succeeded`, `nfts.create.succeeded`,
  `nfts.create.failed`, `nfts.update.succeeded`
- `credential.creation.succeeded`, `credential.creation.failed`
- `payment_methods.status.updated`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
