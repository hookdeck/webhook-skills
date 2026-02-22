# Webflow Webhooks - Express Example

Minimal example of receiving Webflow webhooks with signature verification using Express.

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
# Production
npm start

# Development (with auto-reload)
npm run dev
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
4. View requests in the Hookdeck dashboard

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
├── src/
│   └── index.js        # Express server and webhook handler
├── test/
│   └── webhook.test.js # Test suite
├── .env.example        # Environment variables template
├── package.json        # Dependencies
└── README.md          # This file
```

## Common Issues

### Signature Verification Fails
- Ensure you're using the correct secret (OAuth client secret vs webhook-specific secret)
- Webhook must be created via API or OAuth app (not dashboard) for signatures
- Check that the raw body is being used (not parsed JSON)

### Missing Headers
- Dashboard-created webhooks don't include signature headers
- Recreate the webhook via API or OAuth app

### Webhook Not Received
- Verify the endpoint URL is correct
- Check Webflow webhook logs for delivery attempts
- Ensure your server returns 200 status for successful receipt