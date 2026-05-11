# HubSpot Webhooks - Express Example

Minimal example of receiving HubSpot webhooks with `X-HubSpot-Signature-v3` verification.

## Prerequisites

- Node.js 18+
- A HubSpot app with webhook subscriptions and its Client Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your HubSpot app Client Secret to `.env`

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
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to localhost
hookdeck listen 3000 --path /webhooks/hubspot
```

Use the printed Hookdeck URL as the **Target URL** for your HubSpot app's webhook subscriptions.

## Endpoint

- `POST /webhooks/hubspot` - Receives and verifies HubSpot webhook events
