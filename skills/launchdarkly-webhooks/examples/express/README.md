# LaunchDarkly Webhooks - Express Example

Minimal example of receiving LaunchDarkly webhooks with `X-LD-Signature` verification.

## Prerequisites

- Node.js 18+
- LaunchDarkly webhook with **Sign this webhook** enabled (signing is optional; unsigned deliveries are rejected here)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 launchdarkly --path /webhooks/launchdarkly
```

Use the Hookdeck URL as the webhook URL in LaunchDarkly.

## Test

```bash
npm test
```

Tests generate real HMAC-SHA256 signatures over the raw body.
