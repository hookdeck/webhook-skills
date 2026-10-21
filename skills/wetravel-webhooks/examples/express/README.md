# WeTravel Webhooks - Express Example

Minimal example of receiving WeTravel webhooks with signature verification using
the official [`svix`](https://www.npmjs.com/package/svix) library (WeTravel
delivers webhooks through Svix).

## Prerequisites

- Node.js 22+ (`svix` 2.x is ESM-only and requires Node 22)
- WeTravel main account with an API key and webhooks enabled
- The endpoint's Signing Secret (`whsec_...`) from Manage Webhooks

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your WeTravel signing secret to `.env` (`WETRAVEL_WEBHOOK_SECRET`)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/wetravel
```

## Local Testing with Hookdeck

Receive real WeTravel webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 wetravel --path /webhooks/wetravel
```

Add the printed URL in WeTravel under **Profile → Edit Profile → Webhooks →
Manage Webhooks → + Add Endpoint**, then send a test event or create a test
booking.

## Test

```bash
npm test
```

The tests sign requests with the Svix algorithm and cover `svix-*` and
`webhook-*` headers, secret rotation, invalid signatures, tampered bodies, stale
timestamps and every WeTravel event type.
