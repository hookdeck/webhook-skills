# PAY.JP Webhooks - FastAPI Example

Minimal example of receiving PAY.JP webhooks and authenticating them with the
`X-Payjp-Webhook-Token` header.

PAY.JP does not sign payloads, so there is no HMAC to verify. A FastAPI dependency compares the
whole `X-Payjp-Webhook-Token` header with your account's webhook token using `hmac.compare_digest`
on bytes (both sides encoded, so non-ASCII input never raises), before the body is parsed. A static
token authenticates the sender, not the body, and gives no replay protection: use HTTPS, dedupe on
the event `id`, and rotate the token if it leaks.

## Prerequisites

- Python 3.9+
- A PAY.JP account (see [../../references/setup.md](../../references/setup.md))

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

3. Set `PAYJP_WEBHOOK_SECRET`. Use the webhook token (whook_...) shown in your PAY.JP account settings.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/payjp`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send documented events with correct, wrong and missing tokens. No PAY.JP account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/payjp \
  -H "Content-Type: application/json" \
  -H "X-Payjp-Webhook-Token: $PAYJP_WEBHOOK_SECRET" \
  -d '{"id":"evnt_test_1","object":"event","livemode":false,"type":"charge.succeeded","created":1442212986,"pending_webhooks":1,"data":{"id":"ch_test","object":"charge","amount":5000,"currency":"jpy"}}'
```

## Receive Webhooks Locally

PAY.JP can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 payjp --path /webhooks/payjp
```

Put the printed URL in the PAY.JP webhook settings.

## How It Works

- `main.py`: `verify_payjp_request()`, the `require_payjp_token` dependency and the route

1. The `X-Payjp-Webhook-Token` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a PAY.JP event object (`400` otherwise).
3. A repeated event `id` is acknowledged without being handled again.
4. The handler dispatches on `type`: `charge.succeeded`, `charge.failed`, `charge.updated`,
   `charge.refunded`, `charge.captured`, `dispute.created`, `customer.created`,
   `customer.updated`, `customer.deleted`, `subscription.created`, `subscription.renewed`,
   `subscription.canceled`, `transfer.succeeded`.
5. It returns `{"received": true}` with status 200 (PAY.JP only needs the 200 status).
