# Delivereasy Webhooks - Express Example

Minimal example of receiving Delivereasy Lastmile webhooks with signature verification.

> Only Lastmile webhooks are supported: paste your Delivereasy API key. Marketplace webhooks (X-Delivereasy-Signature) aren't covered.

## Prerequisites

- Node.js 18+
- A Delivereasy Lastmile account and its API key (the HMAC key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Put your Delivereasy API key in `.env` as `DELIVEREASY_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real webhooks locally (a Delivereasy representative configures the URL):

```bash
npx hookdeck-cli listen 3000 delivereasy --path /webhooks/delivereasy
```
