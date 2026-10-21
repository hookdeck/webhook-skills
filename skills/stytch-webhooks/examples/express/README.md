# Stytch Webhooks - Express Example

Minimal example of receiving Stytch webhooks (delivered by Svix) with signature verification. It verifies manually rather than with the `svix` SDK, because the SDK always enforces a 5-minute timestamp window and Hookdeck retries and replays keep the original timestamp. Set `STYTCH_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to turn the window on.

## Prerequisites

- Node.js 18+
- Stytch project with a webhook endpoint and its `whsec_` signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Stytch webhook signing secret to `.env` as `STYTCH_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 stytch --path /webhooks/stytch
```

Paste the tunnel URL into Stytch Dashboard > Webhooks > Add Endpoint.

## Test

```bash
npm test
```

Tests generate real Svix signatures (`HMAC-SHA256` over `{svix-id}.{svix-timestamp}.{body}`, keyed with the base64-decoded `whsec_` secret).
