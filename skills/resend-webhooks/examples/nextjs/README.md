# Resend Webhooks - Next.js Example

Minimal example of receiving Resend webhooks with signature verification using Next.js App Router.

## Prerequisites

- Node.js 18+
- Resend account with webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Resend webhook signing secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI (Recommended)

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to localhost (no account required)
hookdeck listen 3000 --path /webhooks/resend
```

Then configure the Hookdeck URL in your Resend webhook settings.

### Using ngrok

```bash
ngrok http 3000
```

Use the ngrok URL as your webhook endpoint in the Resend dashboard.

### Trigger Test Events

From the Resend Dashboard:
1. Go to Webhooks
2. Select your webhook
3. Click "Send Test"
4. Choose an event type and send

## Endpoint

- `POST /webhooks/resend` - Receives and verifies Resend webhook events
