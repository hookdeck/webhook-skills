# Discord Webhooks - Express Example

Minimal Express example for receiving Discord webhook events with Ed25519 signature verification, using the [`discord-interactions`](https://www.npmjs.com/package/discord-interactions) helper.

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

3. Add your Discord application **Public Key** (hex) to `.env`:
   ```bash
   DISCORD_PUBLIC_KEY=abc123...
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## Test

```bash
npm test
```

The test suite generates a real Ed25519 keypair and exercises:

- PING (`type: 0`) → 204
- Valid event signatures → 204
- Missing signature headers → 401
- Invalid signature → 401
- Body tampering after signing → 401
- All common event types (`APPLICATION_AUTHORIZED`, `ENTITLEMENT_CREATE`, `LOBBY_MESSAGE_CREATE`, etc.)

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/discord
```

## Local Testing with Hookdeck

```bash
# Create a tunnel
npx hookdeck-cli listen 3000 discord --path /webhooks/discord
```

Paste the public URL into Discord Developer Portal → your app → Webhooks → Endpoint URL.

## Manual Testing from Discord

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → your app → Webhooks.
2. Set the Endpoint URL (this triggers a signed PING).
3. Subscribe to events under **Event Subscriptions**.
4. Use the **Send Test** button or trigger a real event (e.g. authorize the app).
