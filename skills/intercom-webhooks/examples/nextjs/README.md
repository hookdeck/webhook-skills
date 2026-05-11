# Intercom Webhooks - Next.js Example

Minimal example of receiving Intercom webhooks with `X-Hub-Signature` HMAC-SHA1
verification, using the Next.js App Router.

## Prerequisites

- Node.js 18+
- An Intercom app in the Developer Hub (for the `client_secret`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Intercom app's `client_secret` to `.env.local`:
   - In the Intercom Developer Hub, open your app → **Basic Information** →
     copy the **Client secret**.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 intercom --path /webhooks/intercom
```

Use the printed URL as the **Endpoint URL** in Intercom's Developer Hub.

### Run the test suite

```bash
npm test
```

## Endpoint

- `POST /webhooks/intercom` — receives and verifies Intercom notifications
