# Cursor Webhooks - Next.js Example

Minimal example of receiving Cursor webhooks with signature verification in Next.js App Router.

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
   cp .env.example .env.local
   ```

3. Add your Cursor webhook signing secret to `.env.local`

## Run

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
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

## API Routes

- `POST /webhooks/cursor` - Receives and verifies Cursor webhooks