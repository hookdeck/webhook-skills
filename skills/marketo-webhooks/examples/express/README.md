# Marketo Webhooks - Express Example

Minimal example of receiving Marketo Smart Campaign webhooks (the **Call
Webhook** flow step) and authenticating them with a shared-secret custom header.

> **Marketo doesn't sign webhooks.** There's no signature header and no HMAC.
> You add a secret header to the webhook yourself
> (**Webhook Actions → Set Custom Header**, e.g. `X-Webhook-Secret: <hex>`) and
> this example compares it in constant time before reading the body. The payload
> is the Payload Template you write, with an `event` field (`lead_created` /
> `lead_updated`) that you set in each webhook.

## What This Example Shows

- `src/index.js`: an Express app with `express.raw({ type: '*/*' })` on `POST /webhooks/marketo`.
- A constant-time check of the custom header (name from `MARKETO_WEBHOOK_HEADER`, default `X-Webhook-Secret`), run before the body is parsed. It fails closed: with `MARKETO_WEBHOOK_SECRET` unset, every request gets a `500`.
- `401` for a missing or wrong secret, `400` for invalid JSON or a missing `event`, `200` (logged) for an unknown `event`.
- Dispatch on `lead_created` and `lead_updated`, plus a dedupe key, because Marketo sends no delivery ID.

## Prerequisites

- Node.js 18+
- A Marketo Engage instance with access to **Admin → Webhooks**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret and set it as `MARKETO_WEBHOOK_SECRET` in `.env`:
   ```bash
   openssl rand -hex 32
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000, with the webhook endpoint at `POST /webhooks/marketo`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 marketo --path /webhooks/marketo
```

No account required. Paste the URL it prints into a Marketo webhook:

1. **Admin → Webhooks → New Webhook**. **URL** = the Hookdeck URL, **Request Type** `POST`.
2. **Payload Template** (use **Insert Token**; Marketo quotes string tokens for you):
   ```json
   {
     "event": "lead_created",
     "campaign": {{campaign.name}},
     "lead": {
       "id": {{lead.Id}},
       "email": {{lead.Email Address}},
       "first_name": {{lead.First Name}},
       "last_name": {{lead.Last Name}},
       "company": {{lead.Company Name}}
     }
   }
   ```
3. **Request Token Encoding** JSON, then **Webhook Actions → Set Custom Header**: `X-Webhook-Secret` = your secret.
4. Add a **Call Webhook** step to a trigger Smart Campaign (e.g. **Person is Created**).
5. Make a second webhook with `"event": "lead_updated"` for **Data Value Changes**.

## Test

```bash
npm test
```

Or send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/marketo \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $MARKETO_WEBHOOK_SECRET" \
  -d '{"event":"lead_created","campaign":"Test","lead":{"id":1042,"email":"amy@example.com"}}'
```
