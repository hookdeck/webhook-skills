# Notion Webhooks - Next.js Example

Minimal example of receiving Notion webhooks in a Next.js App Router route
handler, with the verification handshake and HMAC-SHA256 signature
verification.

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
   cp .env.example .env.local
   ```

3. The `NOTION_VERIFICATION_TOKEN` is initially unset — the first request
   will be the handshake and will print the token to stdout.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000.

The webhook endpoint is `POST /webhooks/notion`.

## The Handshake

1. Expose the server publicly (Hookdeck, ngrok, etc.).
2. Add a webhook subscription in Notion pointing at
   `https://<your-public-url>/webhooks/notion`.
3. Notion sends a single POST containing
   `{ "verification_token": "secret_..." }`. The handler logs it.
4. Paste that token into the Notion subscription UI **and** into your
   `.env.local`, then restart the server.
5. Subsequent webhooks arrive with `X-Notion-Signature` and are verified.

## Test

```bash
npm test
```

## Endpoint

- `POST /webhooks/notion` - Handles the handshake and verifies signed events.
