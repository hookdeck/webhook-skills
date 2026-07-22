# WhatsApp Webhooks - Express Example

Minimal example of receiving WhatsApp (Meta Cloud API) webhooks with the GET
verification handshake and `X-Hub-Signature-256` signature verification.

## Prerequisites

- Node.js 18+
- A Meta app with the WhatsApp product added (for the **app secret** and a
  **verify token** you choose)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set values in `.env`:
   - `WHATSAPP_APP_SECRET` — App Dashboard → App Settings → Basic → App Secret
   - `WHATSAPP_VERIFY_TOKEN` — any random string; paste the same value into the dashboard

## Run

```bash
npm start
```

Server runs on http://localhost:3000

- `GET /webhooks/whatsapp` — Meta verification handshake (echoes `hub.challenge`)
- `POST /webhooks/whatsapp` — event delivery (verifies the signature)

## Test

Run the test suite (generates real signatures and exercises the handshake):

```bash
npm test
```

## Local Development

Expose your local server with the Hookdeck CLI (no account required) and use the
printed URL as the Callback URL in the WhatsApp dashboard:

```bash
npx hookdeck-cli listen 3000 whatsapp --path /webhooks/whatsapp
```

## Key Points

- **Raw body** — the `POST` route uses `express.raw` so the signature is verified
  against the exact bytes Meta signed (it escapes unicode; re-serialized JSON fails).
- **Two secrets** — the app secret signs POSTs; the verify token is only for the GET
  handshake.
- **Echo the challenge** — the GET handshake returns the raw `hub.challenge` as plain
  text, not JSON.
