# Attentive Webhooks - Express Example

Minimal example of receiving Attentive webhooks with signature verification.

## Prerequisites

- Node.js 18+
- An Attentive webhook configured with a Signing key (from the custom app's Webhooks tab)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Attentive signing key to `.env` as `ATTENTIVE_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
npm test
```

### Using Hookdeck CLI

Forward public webhook traffic to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 attentive --path /webhooks/attentive
```

Then set the printed URL as your webhook URL in the Attentive dashboard, and use
its "example payload" test to trigger a delivery.

## Endpoint

- `POST /webhooks/attentive` - Receives and verifies Attentive webhook events
