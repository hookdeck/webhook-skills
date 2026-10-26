# 360dialog Webhooks - Express Example

Minimal example of receiving 360dialog (WhatsApp Business API) webhooks and authenticating
them with HTTP Basic auth.

360dialog does not sign webhooks. You set `Authorization: Basic base64(USER:PASS)` in the
`headers` object when you set the webhook URL, and 360dialog sends it with every request. The
handler decodes it, splits on the first colon and compares the username and the password each
in constant time, evaluating both before deciding. A static credential authenticates the
sender, not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

## Prerequisites

- Node.js 18+
- A 360dialog WhatsApp number with an API key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `THREE_SIXTY_DIALOG_WEBHOOK_USERNAME` and `THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD` to the
   USER and PASS you put in the webhook `Authorization` header.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/360dialog`.

## Test

```bash
npm test
```

The tests send the documented inbound message, status, Coexistence echo and state sync shapes
with correct, wrong, missing and malformed `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/360dialog \
  -H "Content-Type: application/json" \
  -u "$THREE_SIXTY_DIALOG_WEBHOOK_USERNAME:$THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD" \
  -d '{"object":"whatsapp_business_account","entry":[{"id":"WABA_ID","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","statuses":[{"id":"wamid.ID","status":"delivered","recipient_id":"16315551234"}]}}]}]}'
```

## Receive 360dialog Webhooks Locally

```bash
npx hookdeck-cli listen 3000 360dialog --path /webhooks/360dialog
```

Set the printed URL as your webhook URL with the API (see setup.md), including the
`Authorization` header.

## How It Works

- `src/index.js`: `verify360dialogRequest()`, `parseBasicAuth()`, `extractEvents()` and the `POST /webhooks/360dialog` route

1. `express.raw({ type: '*/*' })` reads the body as raw bytes, so any content type works and
   nothing is parsed until the credential check passes.
2. The `Authorization: Basic` header is parsed (scheme case-insensitive, first colon splits the
   username from the password) and both parts are compared in constant time. A missing or
   malformed header, or a mismatch, returns `401`. Missing server config returns `500`.
3. The body must be a JSON object (`400` otherwise).
4. Events come from `entry[].changes[].field`: for `messages` the handler separates inbound
   `messages` from `statuses` (and `errors`); `smb_message_echoes`, `history` and
   `smb_app_state_sync` are the Coexistence events. History and state sync can also arrive in
   an `{id, event, data}` envelope, which is handled too.
5. It returns `200 {"received": true}` (360dialog needs a 200 within 5 seconds).
