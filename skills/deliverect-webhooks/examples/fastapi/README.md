# Deliverect Webhooks - FastAPI Example

Minimal example of receiving Deliverect webhooks with HMAC-SHA256 signature verification.

## Prerequisites

- Python 3.9+
- A Deliverect integration with an HMAC secret (or, before certification, the call's `channelLink` / `locationId`)

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

3. Set `DELIVERECT_WEBHOOK_SECRET` in `.env`: the HMAC secret from your Deliverect Integration
   settings. Before certification Deliverect signs with the `channelLink` or `locationId` value instead.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The webhook route is `/webhooks/deliverect`, with an optional
kind segment (`/webhooks/deliverect/order_status_update`, `menu_update`, `snooze_unsnooze`,
`busy_mode`). It accepts GET, POST, PUT, PATCH and DELETE.

## Test

```bash
pytest test_webhook.py
```

To send a request by hand, sign the exact body bytes (GET requests with no body are signed over the empty string):

```bash
BODY='{"orderId":"o-1","status":20}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$DELIVERECT_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:8000/webhooks/deliverect/order_status_update \
  -H "Content-Type: application/json" \
  -H "x-server-authorization-hmac-sha256: $SIG" \
  -d "$BODY"
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 deliverect --path /webhooks/deliverect
```

If your Hookdeck source only allows POST, also allow GET (and any other method Deliverect sends).
