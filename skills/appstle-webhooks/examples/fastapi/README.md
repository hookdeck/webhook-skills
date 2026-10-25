# Appstle Webhooks - FastAPI Example

Minimal example of receiving Appstle Subscriptions webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Appstle's webhooks are delivered by Svix).

## Prerequisites

- Python 3.9+
- Appstle account with access to **Settings → Webhooks** and an endpoint signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Appstle signing secret to `.env` as `APPSTLE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/appstle
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`).

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 appstle --path /webhooks/appstle
```

1. In Appstle, go to **Settings → Webhooks**, add an endpoint and paste the tunnel URL.
2. Copy the endpoint's **Signing Secret** into `.env`.
3. Open the endpoint and use **Send Example** to send a sample event.

## Timestamp Window

The `svix` library always rejects timestamps more than 5 minutes old. Hookdeck retries and
replays resend the original timestamp, so a late retry fails verification here. If you receive
through Hookdeck, use the manual verifier in
[`references/verification.md`](../../references/verification.md) and drop or widen the window.

## Event Handling

Every delivery is an envelope `{"type": "...", "data": {...}}`. The handler routes these events
and logs anything else:

- `subscription.created`
- `subscription.updated`
- `subscription.activated`
- `subscription.paused`
- `subscription.cancelled`
- `subscription.next-order-date-changed`
- `subscription.billing-interval-changed`
- `subscription.billing-success`
- `subscription.billing-failure`
- `subscription.billing-skipped`
- `subscription.upcoming-order-notification`
