# Clerk Webhooks - Next.js Example

Next.js App Router example for receiving Clerk webhooks using the Clerk SDK (`verifyWebhook` from `@clerk/backend/webhooks`).

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
npm run dev
```

Server runs on http://localhost:3001

## Test

```bash
npm test
```

## Webhook Endpoint

The webhook endpoint is available at:
```
POST http://localhost:3001/webhooks/clerk
```

## Local Testing with Hookdeck

Use Hookdeck CLI to test webhooks locally:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel
hookdeck listen 3001 --path /webhooks/clerk

# Use the provided URL in your Clerk webhook settings
```

## Manual Testing

Send a test webhook from Clerk Dashboard:

1. Go to Clerk Dashboard > Webhooks
2. Click on your webhook endpoint
3. Click "Send test event"
4. Select an event type and send

## Project Structure

```
├── app/
│   └── webhooks/
│       └── clerk/
│           └── route.ts    # Webhook handler
├── test/
│   └── webhook.test.ts     # Tests
└── vitest.config.ts        # Test configuration
```