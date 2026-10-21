# Whop Webhooks - Express Example

Minimal example of receiving Whop webhooks with Standard Webhooks signature verification. It verifies manually rather than with the Whop SDK helper, because the helper always enforces a 5-minute timestamp window and Hookdeck retries and replays keep the original timestamp. Set `WHOP_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to turn the window on.

## Prerequisites

- Node.js 18+
- Whop account with a webhook signing secret (`ws_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Whop webhook signing secret to `.env` as `WHOP_WEBHOOK_SECRET`. Use it exactly as Whop gave it, including the `ws_` prefix.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the automated tests (they generate real Standard Webhooks signatures):

```bash
npm test
```

To receive real events locally, start the Hookdeck CLI tunnel:

```bash
npx hookdeck-cli listen 3000 whop --path /webhooks/whop
```

Register the URL it prints as the endpoint in Whop (Developer tab, **Create webhook**), or use **Send test event** from the webhook's menu in the dashboard.

## Endpoint

`POST /webhooks/whop` returns `200` for valid events and `400` for a missing or invalid signature.
