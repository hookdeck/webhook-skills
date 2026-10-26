# Certn Webhooks - Express Example

Minimal example of receiving Certn webhooks with `Certn-Signature` verification.

## Prerequisites

- Node.js 18+
- Certn account with webhooks enabled on the Partner page, and signed payloads turned on so you have the signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret to `.env` (`CERTN_WEBHOOK_SECRET`). Signing is opt-in: without it Certn sends unsigned deliveries, which fail verification.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })`, verifies `Certn-Signature` (`t=<unix seconds>, v1=<hex HMAC-SHA256 of "<t>.<request body>">`, accepting any of several `v1` values), then dispatches on the applicant object's `report_status` (for example `COMPLETE`). Certn has no event types. The timestamp check is off by default because retries and replays keep the original timestamp; set `CERTN_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 certn --path /webhooks/certn
```

Use the Hookdeck URL as the webhook URL on the Certn Partner page, then click Enable Integration.
