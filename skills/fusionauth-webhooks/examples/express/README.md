# FusionAuth Webhooks - Express Example

Minimal example of receiving FusionAuth webhooks with JWT signature verification.

## Prerequisites

- Node.js 18+
- FusionAuth instance with webhook signing enabled
- HMAC signing key from FusionAuth Key Master

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your FusionAuth HMAC webhook secret to `.env`:
   - In FusionAuth admin, go to **Settings → Key Master**
   - Create or view your HMAC signing key
   - Copy the secret value to `FUSIONAUTH_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test Locally

Use Hookdeck CLI to receive webhooks on localhost:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Start tunnel (no account needed)
hookdeck listen 3000 --path /webhooks/fusionauth
```

Then configure FusionAuth to send webhooks to the Hookdeck URL.

## Test Webhook Delivery

In FusionAuth admin:
1. Go to **Settings → Webhooks**
2. Click the test icon (purple) next to your webhook
3. Select an event type (e.g., `user.create`)
4. Click **Send**

## Endpoints

- `POST /webhooks/fusionauth` - Webhook receiver with signature verification
- `GET /health` - Health check

## Run Tests

```bash
npm test
```
