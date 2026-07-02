# Okta Webhooks - Express Example

Minimal example of receiving Okta Event Hooks with Express: the one-time
verification handshake (GET) and authenticated event delivery (POST).

## Prerequisites

- Node.js 18+
- An Okta org where you can create an event hook (see [../../references/setup.md](../../references/setup.md))
- The `Authorization` secret you registered with the hook

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `OKTA_WEBHOOK_SECRET` in `.env` to the same value you registered as the
   event hook's Authorization secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook at `/webhooks/okta`.

## How It Works

- **`GET /webhooks/okta`** — Responds to Okta's verification challenge by echoing
  the `x-okta-verification-challenge` header as `{"verification": "<challenge>"}`.
- **`POST /webhooks/okta`** — Verifies the `Authorization` header (timing-safe)
  against `OKTA_WEBHOOK_SECRET`, then iterates `data.events[]` and dispatches on
  each event's `eventType`.

Okta Event Hooks have **no HMAC signature** — authentication is the static
`Authorization` header value.

## Test

Run the test suite (verification handshake + auth + dispatch):

```bash
npm test
```

## Receive Real Webhooks Locally

Expose your local server with the Hookdeck CLI — no account or install required:

```bash
npx hookdeck-cli listen 3000 okta --path /webhooks/okta
```

Use the printed public URL as your event hook endpoint in the Okta Admin Console,
then click **Verify** to complete the handshake.
