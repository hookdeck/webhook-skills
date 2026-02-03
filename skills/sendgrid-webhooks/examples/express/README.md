# SendGrid Webhooks - Express Example

Minimal example of receiving SendGrid webhooks with ECDSA signature verification.

## Prerequisites

- Node.js 18+
- SendGrid account with webhook verification key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your SendGrid webhook verification key to `.env`:
   - Go to SendGrid Dashboard → Settings → Mail Settings → Event Webhook
   - Enable "Signed Event Webhook"
   - Copy the Verification Key

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite:
```bash
npm test
```

Send a test webhook using SendGrid's dashboard:
1. Go to Event Webhook settings
2. Enter your endpoint URL: `http://localhost:3000/webhooks/sendgrid`
3. Click "Test Your Integration"

Or use Hookdeck CLI for local testing:
```bash
hookdeck listen 3000 --path /webhooks/sendgrid
```