# Xendit Webhooks - FastAPI Example

Minimal example of receiving Xendit webhooks and verifying the `x-callback-token` header.

Xendit does not sign the payload, so there is no HMAC. It sends your **webhook verification
token** unchanged in the `x-callback-token` header, and the handler compares it with
`XENDIT_CALLBACK_TOKEN` using a constant-time comparison.

## Prerequisites

- Python 3.10+
- A Xendit account with a webhook verification token (see [../../references/setup.md](../../references/setup.md))

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

3. Set `XENDIT_CALLBACK_TOKEN` to the token from Xendit Dashboard > Settings > Webhooks.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/xendit`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send Payments API events and invoice callbacks with a correct, wrong, and missing
token. No Xendit account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/xendit \
  -H "Content-Type: application/json" \
  -H "x-callback-token: $XENDIT_CALLBACK_TOKEN" \
  -d '{"event":"payment.capture","data":{"payment_id":"py-123","currency":"IDR","request_amount":1234}}'
```

## Receive Xendit Webhooks Locally

Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 xendit --path /webhooks/xendit
```

Paste the printed URL into Xendit Dashboard > Settings > Webhooks as the URL for the
products you use. Use the dashboard's test button to send a sample event.

## How It Works

- `main.py`: `verify_xendit_token()`, the `require_xendit_token` dependency and the `POST /webhooks/xendit` route

1. The `x-callback-token` header is compared with `XENDIT_CALLBACK_TOKEN` before the body
   is parsed. A missing or wrong token returns `401`. If the variable is unset, everything
   is rejected.
2. The body is read with `await request.body()` (any content type) and parsed as JSON only after the token check (`400` if invalid).
3. Payments API webhooks have an `event` field (`payment.capture`, `payment.failure`,
   `payment_token.activation`, `refund.succeeded` and so on) with the resource under
   `data`. Invoice callbacks have no `event`; the handler checks `status` (`PAID`,
   `EXPIRED`) instead.
4. It returns `200 {"received": true}` quickly. Xendit retries non-2xx responses up to six
   times over 24 hours, so key your side effects on `data.payment_id` (or the invoice `id`).
