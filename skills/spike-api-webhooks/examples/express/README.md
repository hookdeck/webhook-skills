# Spike API Webhooks - Express Example

Minimal example of receiving Spike API webhooks with signature verification.

Spike API has no published webhook verification SDK, so this example verifies the
`X-Body-Signature` header (bare hex HMAC-SHA256 of the raw body) manually with
Node's `crypto` module.

## Prerequisites

- Node.js 18+
- A Spike API application with a webhook endpoint configured in the admin console, and its shared HMAC key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your shared HMAC key to `.env` as `SPIKE_API_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 spike-api --path /webhooks/spike-api
```

Use the printed URL as the webhook endpoint in the Spike API admin console. Spike API
sends a JSON array of events; the handler loops over every element.
