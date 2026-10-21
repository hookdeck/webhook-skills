# WeTravel Webhooks - Next.js Example

Next.js App Router example of receiving WeTravel webhooks with signature
verification using the official [`svix`](https://www.npmjs.com/package/svix)
library (WeTravel delivers webhooks through Svix).

## Prerequisites

- Node.js 22+ (`svix` 2.x requires Node 22)
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
npm run dev
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
Manage Webhooks → + Add Endpoint**.

## Test

```bash
npm test
```

## Project Structure

```
├── app/
│   └── webhooks/
│       └── wetravel/
│           └── route.ts    # Webhook handler
├── test/
│   └── webhook.test.ts     # Tests
└── vitest.config.ts        # Test configuration
```
