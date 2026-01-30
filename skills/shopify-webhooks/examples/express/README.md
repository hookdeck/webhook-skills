# Shopify Webhooks - Express Example

Minimal example of receiving Shopify webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Shopify app or store with webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Shopify API secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to localhost
hookdeck listen 3000 --path /webhooks/shopify
```

Then configure the Hookdeck URL in your Shopify app settings.

### Using ngrok

```bash
ngrok http 3000
```

Use the ngrok URL as your webhook endpoint in Shopify.

## Endpoint

- `POST /webhooks/shopify` - Receives and verifies Shopify webhook events
