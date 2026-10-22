# Emporix Webhooks - FastAPI Example

Minimal example of receiving Emporix webhooks with signature verification using the
official Svix library ([`svix`](https://pypi.org/project/svix/)). Emporix delivers webhooks through Svix
(the Svix-Shared default strategy or your own licensed Svix account).

The Emporix **Other - HTTP** strategy (`emporix-event-signature`) is **not** covered here.

## Prerequisites

- Python 3.9+
- An Emporix tenant with webhooks set up on a Svix strategy and an endpoint signing secret (`whsec_...`) from the Svix dashboard

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's signing secret to `.env` as `EMPORIX_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/emporix
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`, key = base64-decoded secret after `whsec_`).

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 emporix --path /webhooks/emporix
```

1. In the Emporix Management Dashboard go to **Administration → Webhooks → Open Svix Dashboard → Endpoints → Add endpoint**
   and paste the tunnel URL (optionally with `?eventType=order.created`, see below).
2. Copy the endpoint's **Signing Secret** into `.env`.
3. Subscribe to events under **Administration → Webhooks** and trigger one (for example create an order or a product).

## Event Handling

The handler routes these events and logs anything else:

- `order.created`
- `order.updated`
- `customer.created`
- `product.created`
- `product.updated`

Emporix documents each event's payload schema but no envelope, and Svix sends no event-type header.
The handler takes the event type from an `eventType` field in the body if present, otherwise from an
`?eventType=` query parameter. That query parameter is this example's convention, not an Emporix feature:
register one Svix endpoint per event type with the parameter on its URL.

## Timestamp window

`svix` always rejects requests whose `svix-timestamp` is more than 5 minutes old. Hookdeck retries and
replays resend the original timestamp, so late retries fail with `400 Timestamp too old`. See
`references/verification.md` in the skill for a manual verifier where the window can be dropped or widened.
