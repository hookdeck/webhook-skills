# Schematic Webhooks - Express Example

Minimal example of receiving Schematic webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Schematic account with a webhook endpoint configured (gives you the webhook secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Schematic webhook secret to `.env` as `SCHEMATIC_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 schematic --path /webhooks/schematic
```

Then set the Hookdeck URL as the endpoint URL in Schematic's webhooks page.

## Endpoint

- `POST /webhooks/schematic` - verifies `X-Schematic-Webhook-Signature` (hex HMAC-SHA256 of `rawBody + "+" + X-Schematic-Webhook-Timestamp`) and dispatches on the body's `action`
- Invalid or missing signature returns `401`
- `SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS` (optional, off by default) rejects timestamps older than the window
