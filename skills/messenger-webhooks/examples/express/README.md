# Facebook Messenger Webhooks - Express Example

Minimal example of receiving Facebook Messenger Platform webhooks with the GET
verification handshake and `X-Hub-Signature-256` signature verification over the
raw (escaped-unicode) body.

## Prerequisites

- Node.js 18+
- A published [Meta for Developers](https://developers.facebook.com/) app with Messenger, and a Facebook Page

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add `MESSENGER_APP_SECRET` (App settings > Basic > App Secret) and
   `MESSENGER_VERIFY_TOKEN` (any string; enter the same value in Messenger > Settings) to `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 messenger --path /webhooks/messenger
```

Use the tunnel URL as the **Callback URL** in Messenger > Settings, subscribe the
fields you need, then subscribe your Page via `POST /<PAGE_ID>/subscribed_apps`.

Check the handshake locally:

```bash
curl "localhost:3000/webhooks/messenger?hub.verify_token=YOUR-VERIFY-TOKEN&hub.challenge=CHALLENGE_ACCEPTED&hub.mode=subscribe"
```

### Run the tests

```bash
npm test
```

## Endpoints

- `GET /webhooks/messenger` - Verification handshake (echoes `hub.challenge`)
- `POST /webhooks/messenger` - Verifies the signature, then dispatches `entry[].messaging[]` and `standby[]` events: `messages`, `message_echoes`, `messaging_postbacks`, `message_reads`, `message_deliveries`, `message_reactions`, `messaging_optins`, `messaging_referrals`, `message_edits`, `messaging_account_linking`
