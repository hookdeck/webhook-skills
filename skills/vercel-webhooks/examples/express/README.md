# Vercel Webhooks - Express Example

Minimal example of receiving Vercel webhooks with signature verification using Express.

## Prerequisites

- Node.js 18+
- Vercel account with Pro or Enterprise plan
- Webhook secret from Vercel dashboard

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Vercel webhook secret to `.env`:
   ```
   VERCEL_WEBHOOK_SECRET=your_secret_from_vercel_dashboard
   ```

## Run

Start the server:
```bash
npm start
```

Server runs on http://localhost:3000

The webhook endpoint is available at:
```
POST http://localhost:3000/webhooks/vercel
```

## Test

Run the test suite:
```bash
npm test
```

## Local Testing with Hookdeck

For local webhook development, use the Hookdeck CLI:

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Start local tunnel
hookdeck listen 3000 --path /webhooks/vercel

# Copy the webhook URL and add it to your Vercel dashboard
```

## Project Structure

```
.
├── src/
│   └── index.js      # Express server with webhook handler
├── test/
│   └── webhook.test.js   # Tests with signature verification
├── .env.example
├── package.json
└── README.md
```

## Triggering Test Events

To trigger a test webhook from Vercel:

1. Make a small change to your project
2. Deploy with: `vercel --force`
3. This will trigger a `deployment.created` event

## Common Issues

### Signature Verification Failing

- Ensure you're using the raw request body
- Check that the secret in `.env` matches exactly (no extra spaces)
- Verify the header name is lowercase: `x-vercel-signature`

### Missing Headers

- Vercel sends the signature in `x-vercel-signature`
- Express converts headers to lowercase

### Webhook Not Received

- Verify your endpoint is publicly accessible
- Check Vercel dashboard for delivery status
- Ensure you've selected the correct events to receive