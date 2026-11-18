# The Things Stack Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [The Things Stack](https://www.thethingsindustries.com/docs/integrations/webhooks/) webhooks and verifying the `Authorization: Basic` credentials from Request authentication.

## Prerequisites

- Node.js 18+
- An application in The Things Stack with a custom webhook (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `TTS_WEBHOOK_USERNAME` and `TTS_WEBHOOK_PASSWORD` in `.env.local` to the credentials you entered under Request authentication.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/the-things-stack` in [app/webhooks/the-things-stack/route.ts](app/webhooks/the-things-stack/route.ts); the verification code is in [lib/verify-the-things-stack.ts](lib/verify-the-things-stack.ts).

## Test

```bash
npm test
```

The tests cover the header the Console builds (with a colon in the password), other schemes and malformed credentials, valid credentials, telling message types apart, a wrong password, a wrong username, a missing header, invalid JSON, and missing credentials.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 the-things-stack --path /webhooks/the-things-stack
```

Use the printed URL as the webhook's Base URL, turn on Request authentication with the same credentials, and enable Uplink message.

## Notes

- The Things Stack doesn't sign requests. Basic auth from Request authentication is the only check, so keep the endpoint on HTTPS.
- Never log `X-Downlink-Apikey`: it's an API key that can schedule downlinks.
