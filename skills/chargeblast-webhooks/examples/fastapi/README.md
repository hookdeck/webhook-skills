# Chargeblast Webhooks - FastAPI Example

Minimal example of receiving Chargeblast webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Chargeblast delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Chargeblast account with a webhook URL configured and its webhook secret (`whsec_...`)

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

3. Add your Chargeblast webhook secret to `.env` as `CHARGEBLAST_WEBHOOK_SECRET`
   (the full `whsec_...` value from the dashboard's settings tab).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/chargeblast
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
npx hookdeck-cli listen 8000 chargeblast --path /webhooks/chargeblast
```

1. Set the tunnel URL as the webhook URL in the Chargeblast dashboard's settings tab.
2. Copy the webhook secret into `.env`.
3. Wait for an alert or deflection, or use a manual replay or test send, to trigger `alert.created`.

## Event Handling

The body has no envelope and no type field. The handler reads the event name from the
`X-Event-Type` header, routes these events, and logs anything else:

- `alert.created`
- `alert.updated`
- `alert.refunded`
- `alert.matched`
- `alert.will_expire`
- `alert.within_refund_rules`
- `deflection.created`
- `deflection.updated`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
