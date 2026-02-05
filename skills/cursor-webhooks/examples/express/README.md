# Cursor Webhooks - Express Example

Minimal example of receiving Cursor webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Cursor account with webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Cursor webhook signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite:

```bash
npm test
```

## Local Development

Use Hookdeck CLI to receive webhooks locally:

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Forward webhooks to your local server
hookdeck listen 3000 --path /webhooks/cursor
```

## Endpoints

- `POST /webhooks/cursor` - Receives and verifies Cursor webhooks
- `GET /health` - Health check endpoint