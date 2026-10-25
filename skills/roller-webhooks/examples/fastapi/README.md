# ROLLER Webhooks - FastAPI Example

Minimal example of receiving ROLLER webhooks and authenticating them with the
`x-roller-apikey` header.

ROLLER does not sign payloads, so there is no HMAC to verify. The handler compares the
`x-roller-apikey` header with your webhook's apiKey using a constant-time comparison. The route reads the raw body, so any content type works.
A static key authenticates the sender, not the body, and gives no replay protection: use HTTPS
and rotate the key if it leaks.

## Prerequisites

- Python 3.9+
- A ROLLER webhook registered through the REST API (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

Set `ROLLER_WEBHOOK_API_KEY` to the apiKey you registered. Set the webhook's apiKey to a long random value, then paste the same value here.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/roller`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every event with correct, wrong and missing keys. No ROLLER account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/roller \
  -H "Content-Type: application/json" \
  -H "x-roller-apikey: $ROLLER_WEBHOOK_API_KEY" \
  -d '{"type":"Booking","eventType":"Created"}'
```

## Receive Webhooks Locally

ROLLER can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 roller --path /webhooks/roller
```

Use the printed URL as the webhook `url` when registering.

## How It Works

1. The `x-roller-apikey` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler joins the `type` and `eventType` fields (ROLLER sends them separately) and dispatches on the result: `Booking.Created`, `Booking.Updated`, `Booking.Cancelled`, `Customer.Created`, `Redemption.Created`, `PaymentLink.Created`.
4. It returns `200 {"received": true}`. ROLLER expects an acknowledgement within 10 seconds.
