# Discord Webhooks - Next.js Example

Next.js App Router example for receiving Discord webhook events with Ed25519 signature verification, using the [`discord-interactions`](https://www.npmjs.com/package/discord-interactions) helper.

## Prerequisites

- Node.js 18+
- Discord application with a Public Key (from [Developer Portal](https://discord.com/developers/applications) → General Information)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Discord application **Public Key** (hex) to `.env`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3001.

## Test

```bash
npm test
```

## Webhook Endpoint

```
POST http://localhost:3001/webhooks/discord
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3001 discord --path /webhooks/discord
```

Paste the public tunnel URL into Discord Developer Portal → your app → Webhooks → Endpoint URL.

## Project Structure

```
├── app/
│   └── webhooks/
│       └── discord/
│           └── route.ts    # Webhook handler
├── test/
│   └── webhook.test.ts     # Tests
└── vitest.config.ts        # Test configuration
```
