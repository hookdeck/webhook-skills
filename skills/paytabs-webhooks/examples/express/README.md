# PayTabs Webhooks - Express Example

Minimal example of receiving PayTabs callback and IPN webhooks with `Signature` (hex HMAC-SHA256 of the raw body) verification.

## Prerequisites

- Node.js 18+
- A PayTabs profile ServerKey

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your profile ServerKey to `.env` as `PAYTABS_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and the route is `POST /webhooks/paytabs`.

## Test

```bash
npm test
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as your callback or IPN URL:

```bash
npx hookdeck-cli listen 3000 paytabs --path /webhooks/paytabs
```
