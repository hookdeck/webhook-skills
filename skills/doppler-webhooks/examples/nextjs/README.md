# Doppler Webhooks - Next.js Example

Minimal example of receiving Doppler webhooks with signature verification using the App Router.

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
npm run dev
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

- `POST /webhooks/doppler` - Receives and verifies Doppler webhook events (`X-Doppler-Signature`). Reads the body with `request.text()` so the signature is checked against the raw bytes. Verification lives in `lib/verify.ts`.
