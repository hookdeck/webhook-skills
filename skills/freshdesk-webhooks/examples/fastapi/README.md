# Freshdesk Webhooks - FastAPI Example

Minimal example of receiving Freshdesk automation webhooks (the **Trigger
Webhook** action) and authenticating them with a shared-secret custom header.

> **Freshdesk doesn't sign webhooks.** There's no signature header and no HMAC.
> You add a secret header to the automation rule yourself
> (`X-Freshdesk-Webhook-Secret: <hex>`) and this example compares it in
> constant time before reading the body. The payload is the JSON you write in
> the rule, with an `event` field (`ticket_created` / `ticket_updated`) that you
> set in each rule.

## What This Example Shows

- `main.py`: a FastAPI app where a `Depends(require_freshdesk_secret)` dependency checks the header before the route reads `await request.body()`.
- A constant-time check of the custom header (name from
  `FRESHDESK_WEBHOOK_HEADER`, default `X-Freshdesk-Webhook-Secret`), run before
  the body is parsed. It fails closed: with `FRESHDESK_WEBHOOK_SECRET` unset,
  every request gets a `500`.
- `401` for a missing or wrong secret, `400` for invalid JSON or a missing
  `event`, `200` (logged) for an unknown `event`.
- Dispatch on `ticket_created` and `ticket_updated`, plus a dedupe key, because
  Freshdesk retries failed calls every 30 minutes (48 calls in total).

## Prerequisites

- Python 3.10+
- A Freshdesk account with access to **Admin → Workflows → Automations**

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

3. Generate a secret and set it as `FRESHDESK_WEBHOOK_SECRET` in `.env`:
   ```bash
   openssl rand -hex 32
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, with the webhook endpoint at
`POST /webhooks/freshdesk`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 freshdesk --path /webhooks/freshdesk
```

No account required. Paste the URL it prints into a Freshdesk rule:

1. **Admin → Workflows → Automations → Ticket Creation → New Rule**, then set
   your conditions.
2. Action **Trigger Webhook**, **Request Type** `POST`, **Callback URL** = the
   Hookdeck URL.
3. **Add custom headers**: `X-Freshdesk-Webhook-Secret: <your secret>`.
4. **Encoding** JSON, **Content** Advanced:
   ```json
   {
     "event": "ticket_created",
     "triggered_event": "{{Triggered event}}",
     "ticket": {
       "id": "{{ticket.id}}",
       "subject": "{{ticket.subject}}",
       "status": "{{ticket.status}}",
       "priority": "{{ticket.priority}}",
       "requester_email": "{{ticket.requester.email}}",
       "url": "{{ticket.url}}"
     }
   }
   ```
5. Repeat on the **Ticket Updates** tab with `"event": "ticket_updated"`.

## Test

```bash
pytest test_webhook.py -v
```

Or send a request by hand:

```bash
curl -X POST http://localhost:8000/webhooks/freshdesk \
  -H "Content-Type: application/json" \
  -H "X-Freshdesk-Webhook-Secret: $FRESHDESK_WEBHOOK_SECRET" \
  -d '{"event":"ticket_created","ticket":{"id":"1042","subject":"Test"}}'
```
