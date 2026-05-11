# Linear Webhooks - Express Example

Minimal example of receiving Linear webhooks with `Linear-Signature` HMAC-SHA256 verification and `webhookTimestamp` freshness checks.

## Prerequisites

- Node.js 18+
- A Linear workspace with a webhook configured (see [setup guide](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Linear webhook signing secret to `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## Test

```bash
npm test
```

Runs Jest with [supertest](https://github.com/ladjs/supertest), generating real Linear-style HMAC-SHA256 signatures and asserting verification, freshness checks, and event routing.

### Send a real Linear webhook

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 linear --path /webhooks/linear
```

Paste the printed Hookdeck URL into Linear → **Workspace settings → API → Webhooks → Create new webhook**, then create or update an issue to trigger an event.

## Endpoints

- `POST /webhooks/linear` — Receives and verifies Linear webhook events
- `GET /health` — Health check
