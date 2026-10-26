# beehiiv Webhooks - Express Example

Minimal example of receiving beehiiv webhooks (delivered by Svix) with signature verification using the official `svix` library.

## Prerequisites

- Node.js 22+
- A beehiiv account on a paid plan (Lite and above) with a webhook endpoint and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint's signing secret (`whsec_...`) to `.env` as `BEEHIIV_WEBHOOK_SECRET`. Find it under **Settings > Webhooks** on the endpoint details page.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, with the webhook route at `POST /webhooks/beehiiv`.

## Test locally

```bash
npx hookdeck-cli listen 3000 beehiiv --path /webhooks/beehiiv
```

Add the printed URL as an endpoint in **Settings > Webhooks**, then create a test subscriber or send a test event.

## Run the tests

```bash
npm test
```

The tests sign payloads with the real Svix algorithm (HMAC-SHA256 over `{svix-id}.{svix-timestamp}.{body}`).

## Notes

- The route uses `express.raw({ type: '*/*' })`, so the signature is checked over the exact bytes for any content type. The body is parsed only after the check.
- The `svix` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones are rejected. See `references/verification.md` in the skill for a manual verifier with no window.
