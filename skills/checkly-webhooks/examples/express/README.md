# Checkly Webhooks - Express Example

Minimal example of receiving Checkly alert webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Checkly account with a webhook alert channel and webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Checkly webhook secret to `.env`

4. In Checkly, use a body template that includes the fields the handler reads:
   ```json
   {
     "alertType": "{{ALERT_TYPE}}",
     "checkName": "{{CHECK_NAME}}",
     "checkId": "{{CHECK_ID}}"
   }
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 checkly --path /webhooks/checkly
```

Then use the Hookdeck URL as the webhook URL in your Checkly alert channel and send a test message.

## Endpoint

- `POST /webhooks/checkly` - Receives and verifies Checkly alert webhooks (`ALERT_FAILURE`, `ALERT_RECOVERY`, `ALERT_DEGRADED`). The raw body is read with `express.raw({ type: '*/*' })` so any content type verifies.
