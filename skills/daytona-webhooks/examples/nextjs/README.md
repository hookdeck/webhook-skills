# Daytona Webhooks - Next.js Example

Minimal example of receiving Daytona webhooks with Svix signature verification. It verifies manually rather than with the `svix` SDK, because the SDK always enforces a 5-minute timestamp window and Hookdeck retries and replays keep the original timestamp. Set `DAYTONA_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to turn the window on.

Daytona's public webhook docs don't describe signing. Deliveries go through Svix, so this verifies `svix-id` / `svix-timestamp` / `svix-signature` with the official `svix` library.

## Prerequisites

- Node.js 22+
- A Daytona organization with Webhooks enabled and an endpoint's `whsec_` signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint's signing secret to `.env` as `DAYTONA_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/daytona` (App Router route at `app/webhooks/daytona/route.ts`).

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 daytona --path /webhooks/daytona
```

Use the URL the CLI prints as the **Endpoint URL** when you add an endpoint in the Daytona Dashboard → Webhooks.

## Test

```bash
npm test
```

The tests sign payloads with the Svix algorithm (HMAC-SHA256 over `{id}.{timestamp}.{body}`, base64-decoded `whsec_` key) and cover all seven events, bad signatures, tampered bodies, old timestamps (accepted by default, rejected once the window is set), missing headers, duplicates, and a missing secret.

To try it live, create a sandbox, snapshot or volume in your organization and watch the **Messages** tab in the Dashboard.
