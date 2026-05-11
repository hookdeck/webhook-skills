# Notion Webhooks - Express Example

Minimal example of receiving Notion webhooks with the verification handshake
and HMAC-SHA256 signature verification.

## Prerequisites

- Node.js 18+
- A Notion internal integration (https://www.notion.so/profile/integrations)
- A publicly reachable HTTPS endpoint (Notion does not deliver to localhost)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Start the server (the `NOTION_VERIFICATION_TOKEN` is initially unset — the
   first request will be the handshake and will print the token to stdout).

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## The Handshake

1. Expose the server publicly (see "Test" below).
2. In Notion, add a webhook subscription pointing at
   `https://<your-public-url>/webhooks/notion`.
3. Notion sends a single POST containing `{ "verification_token": "secret_..." }`.
   The handler logs the token.
4. Paste that token into the Notion subscription UI **and** into your `.env`
   as `NOTION_VERIFICATION_TOKEN`, then restart the server.
5. Subsequent webhooks arrive with `X-Notion-Signature` and are verified.

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 notion --path /webhooks/notion
```

Use the printed public URL as the **Webhook URL** in your Notion integration.

### Run unit tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/notion` - Handles the handshake and verifies signed events.
