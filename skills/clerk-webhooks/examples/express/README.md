# Clerk Webhooks - Express Example

Minimal example of receiving Clerk webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Clerk account with webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Clerk webhook signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Webhook Endpoint

The webhook endpoint is available at:
```
POST http://localhost:3000/webhooks/clerk
```

## Local Testing with Hookdeck

Use Hookdeck CLI to test webhooks locally:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel
hookdeck listen 3000 --path /webhooks/clerk

# Use the provided URL in your Clerk webhook settings
```

## Manual Testing

Send a test webhook from Clerk Dashboard:

1. Go to Clerk Dashboard > Webhooks
2. Click on your webhook endpoint
3. Click "Send test event"
4. Select an event type and send