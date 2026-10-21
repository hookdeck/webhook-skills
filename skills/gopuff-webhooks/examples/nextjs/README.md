# Gopuff Webhooks - Next.js Example

Minimal example of receiving Gopuff (Powered by Gopuff partner API) webhooks with Svix signature verification, using the official [`svix`](https://www.npmjs.com/package/svix) SDK.

## Prerequisites

- Node.js 18+
- A Gopuff partner account and the endpoint signing secret (`whsec_...`) from the Svix App Portal

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env` (`GOPUFF_WEBHOOK_SECRET`)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/gopuff
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 gopuff --path /webhooks/gopuff
```

Use the printed URL as the endpoint URL in the Svix App Portal (get an access link from `POST /devportal/v1/webhooks/app-portal-link`). The portal's testing tab can send example events.
