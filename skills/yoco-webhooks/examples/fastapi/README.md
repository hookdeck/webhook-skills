# Yoco Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Yoco](https://www.yoco.com) webhooks with Standard Webhooks signature verification, using the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package that Yoco recommends. Verification runs in a FastAPI dependency (`verified_yoco_event`). It handles events from both the **Yoco API** (`event_type`, e.g. `payment.created`) and the **Checkout API** (`type`, e.g. `payment.succeeded`).

## Prerequisites

- Python 3.9+
- A Yoco account with an API key (Yoco API) or secret key (Checkout API)
- The `whsec_...` secret returned when you created the webhook subscription (it's shown only once, see [setup](../../references/setup.md))

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

3. Put the subscription secret in `YOCO_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/yoco`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Yoco's algorithm. They cover Yoco API and Checkout API events, tampered bodies, malformed signature headers, timestamps outside the 3-minute window, multiple signatures, duplicate `webhook-id`s, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 yoco --path /webhooks/yoco
```

Use the printed URL as the `notification_url` (Yoco API) or `url` (Checkout API) when you create the subscription. With the Yoco API you can then send a sample event with `POST /v1/webhooks/subscriptions/{subscription_id}/test`.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so using a Pydantic body model or `request.json()` before verification breaks it.
- The handler rejects timestamps more than 3 minutes from the server clock, as Yoco recommends. The `standardwebhooks` SDK on its own allows 5 minutes.
- If `YOCO_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Yoco needs a `2xx` within **15 seconds**. Enqueue the event (or use `BackgroundTasks`) and process it asynchronously in production.
- Checkout API webhooks fire for every payment on the account. Match `payload.metadata.checkoutId` against the checkout you created before fulfilling an order.
