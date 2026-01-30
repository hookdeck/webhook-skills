# Shopify Webhooks - Next.js Example

Minimal example of receiving Shopify webhooks with signature verification using Next.js App Router.

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
   cp .env.example .env.local
   ```

3. Add your Shopify API secret to `.env.local`

## Run

```bash
npm run dev
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

## Endpoint

- `POST /webhooks/shopify` - Receives and verifies Shopify webhook events
