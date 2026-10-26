# Dodo Payments Webhooks - FastAPI Example

Minimal example of receiving Dodo Payments webhooks with signature verification using the
[`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library (Dodo Payments follows the
Standard Webhooks specification).

## Prerequisites

- Python 3.9+
- Dodo Payments account with a webhook endpoint and its signing secret (`whsec_...`)

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

3. Add your Dodo Payments webhook secret to `.env` as `DODO_PAYMENTS_WEBHOOK_SECRET`
   (the full `whsec_...` value from the endpoint's **Overview** tab under Developer > Webhooks).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/dodo-payments
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), and check that the
`svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 dodo-payments --path /webhooks/dodo-payments
```

1. In the Dodo Payments dashboard go to **Developer > Webhooks**, add an endpoint with the tunnel URL and choose events.
2. Copy the endpoint's signing secret into `.env`.
3. Use the endpoint's **Testing** tab and **Send example** to deliver a signed event.

`dodo wh trigger` mock events are **not signed**, so this handler rejects them.

## Event Handling

The envelope is `{ business_id, type, timestamp, data }`. The handler reads the event name from the
top-level `type` field, routes these events, and logs anything else:

- `payment.succeeded`, `payment.failed`, `payment.processing`, `payment.cancelled`
- `refund.succeeded`, `refund.failed`
- `dispute.opened`, `dispute.won`, `dispute.lost`
- `subscription.active`, `subscription.renewed`, `subscription.on_hold`, `subscription.cancelled`
- `license_key.created`

There is no event id in the body: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
