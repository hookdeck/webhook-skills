# Mistral Webhooks - Express Example

Minimal example of receiving Mistral AI Studio voice agent webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Mistral AI Studio account with a webhook endpoint and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Mistral endpoint signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the automated tests (they generate real `hmac-sha256=<hex>` signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 mistral --path /webhooks/mistral
```

Then register the Hookdeck URL as the endpoint in Mistral, and subscribe your agent to `call_started`, `call_ended` and `call_failed`.

## Endpoint

- `POST /webhooks/mistral` - Receives and verifies Mistral webhook events (raw body read with `express.raw({ type: '*/*' })`)
