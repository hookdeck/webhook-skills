# Unipile Webhooks - Express Example

Minimal example of receiving Unipile webhooks and authenticating them with a
shared-secret header.

> **Unipile doesn't sign webhooks.** There's no signature header and no HMAC.
> When you create the webhook you add a `headers` entry such as
> `{"key": "Unipile-Auth", "value": "<secret>"}`, and this example compares it in
> constant time before reading the body.

## What This Example Shows

- `POST /webhooks/unipile` reads the raw body and parses JSON itself, because
  webhooks created through the API send no JSON `Content-Type` by default.
- A constant-time check of the header (name from `UNIPILE_WEBHOOK_HEADER`,
  default `Unipile-Auth`), run before the body is parsed. It fails closed: with
  `UNIPILE_WEBHOOK_SECRET` unset, every request gets a `500`.
- `401` for a missing or wrong secret, `400` for invalid JSON or a payload with no
  `event` (and no `AccountStatus`), `200` for an unknown event.
- Dispatch on `message_received`, `message_read`, `mail_received` and the
  `AccountStatus` payload (`OK`, `CREDENTIALS`, ...), plus a dedupe key, because
  Unipile retries up to 5 times when it doesn't get a `200` within 30 seconds.

## Prerequisites

- Node.js 18+
- A Unipile account and API key (`X-API-KEY`) with your DSN

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret and set it as `UNIPILE_WEBHOOK_SECRET` in `.env`:
   ```bash
   openssl rand -hex 32
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000, with the webhook endpoint at
`POST /webhooks/unipile`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 unipile --path /webhooks/unipile
```

No account required. Create the webhook with the URL it prints, adding your secret:

```bash
curl --request POST \
  --url https://{YOUR_DSN}/api/v1/webhooks \
  --header 'X-API-KEY: XXXXXXXX' \
  --header 'content-type: application/json' \
  --data '{
    "request_url": "<HOOKDECK_URL>",
    "source": "messaging",
    "events": ["message_received", "message_read"],
    "headers": [
      { "key": "Content-Type", "value": "application/json" },
      { "key": "Unipile-Auth", "value": "<your secret>" }
    ]
  }'
```

Use `"source": "email"` for `mail_received`, or `"source": "account_status"` for
account status updates.

## Test

```bash
npm test
```

Or send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/unipile \
  -H "Content-Type: application/json" \
  -H "Unipile-Auth: $UNIPILE_WEBHOOK_SECRET" \
  -d '{"event":"message_received","account_id":"acc_1","message_id":"m1","chat_id":"c1","message":"Hi"}'
```
