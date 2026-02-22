# Webflow Webhooks - Next.js Example

Minimal example of receiving Webflow webhooks with signature verification using Next.js App Router.

## Prerequisites

- Node.js 18+
- Webflow account with webhook configured
- Webhook signing secret (from OAuth app or API-created webhook)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Webflow webhook signing secret to `.env`:
   - For OAuth app webhooks: Use your OAuth client secret
   - For API-created webhooks: Use the `secret` field from the creation response

## Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Server runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/webflow`

## Test Locally

Use Hookdeck CLI to create a public URL for your local server:

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Create tunnel
hookdeck listen 3000 --path /webhooks/webflow
```

1. Copy the Hookdeck URL (e.g., `https://events.hookdeck.com/e/src_xxxxx`)
2. Add this URL as your webhook endpoint in Webflow
3. Trigger test events in Webflow
4. Check your Next.js console for logged events

## Test Suite

Run the test suite:

```bash
npm test
```

Tests verify:
- Signature verification with valid signatures
- Rejection of invalid signatures
- Timestamp validation (5-minute window)
- Proper error handling
- Event type handling

## Project Structure

```
├── app/
│   └── webhooks/
│       └── webflow/
│           └── route.ts    # Webhook handler using App Router
├── test/
│   └── webhook.test.ts     # Test suite
├── .env.example            # Environment variables template
├── vitest.config.ts        # Test configuration
├── package.json            # Dependencies
└── README.md              # This file
```

## Implementation Notes

This example uses Next.js 16 App Router with:
- Route Handlers for the webhook endpoint
- Raw body parsing disabled for signature verification
- TypeScript for type safety
- Vitest for testing

## Common Issues

### Signature Verification Fails
- Ensure you're using the correct secret (OAuth client secret vs webhook-specific secret)
- Webhook must be created via API or OAuth app (not dashboard) for signatures
- Verify `bodyParser` is disabled in the route config

### Missing Headers
- Dashboard-created webhooks don't include signature headers
- Recreate the webhook via API or OAuth app

### Type Errors
- Ensure TypeScript is installed and configured
- Run `npm install` to get all type definitions