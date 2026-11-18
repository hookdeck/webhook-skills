# Dial Webhooks - Next.js Example

Minimal example of receiving Dial webhooks with signature verification using the
Next.js App Router. Verification is manual (`crypto`): Dial has no published webhook
verification SDK.

## Prerequisites

- Node.js 18+
- A Dial webhook subscription and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the full signing secret (including `whsec_`) to `.env.local` as `DIAL_WEBHOOK_SECRET`.
   Get it from the dashboard or `GET https://api.getdial.ai/api/v1/webhooks/{id}/secret`.

Behind Hookdeck, raise `DIAL_WEBHOOK_TOLERANCE_SECONDS` (or set `0`): Hookdeck retries
and replays keep the original signed timestamp.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the webhook route is `/webhooks/dial`.

## Test

```bash
npm test
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 dial --path /webhooks/dial
```

Use the printed HTTPS URL as the subscription's `targetUrl`, then click **Fire ping**
in the dashboard or call `POST https://api.getdial.ai/api/v1/webhooks/{id}/ping` to send
a signed `webhook.ping` event.
