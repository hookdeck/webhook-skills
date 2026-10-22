# Doppler Webhooks - Express Example

Minimal example of receiving Doppler webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Doppler project with a webhook configured and a **Secret** set (signing is optional in Doppler, but this example rejects unsigned requests)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Doppler webhook Secret to `.env` as `DOPPLER_WEBHOOK_SECRET`

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
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 doppler --path /webhooks/doppler
```

Then use the Hookdeck URL as the webhook URL in Doppler (Project > Webhooks > + Add).

### Trigger Test Events

Change a secret in a config the webhook is attached to. Doppler sends a `config.secrets.update` payload.

## Endpoint

- `POST /webhooks/doppler` - Receives and verifies Doppler webhook events (`X-Doppler-Signature`). Uses `express.raw({ type: '*/*' })` so the signature is checked against the raw bytes for any content type.
