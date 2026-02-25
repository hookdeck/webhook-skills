# OpenClaw Webhooks - Next.js Example

Minimal example of receiving OpenClaw Gateway webhooks in a Next.js App Router API route.

## Prerequisites

- Node.js 18+
- An OpenClaw Gateway with webhooks enabled

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your OpenClaw hook token to `.env`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
curl -X POST http://localhost:3000/webhooks/openclaw \
  -H 'Authorization: Bearer your_hook_token_here' \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hello from test", "name": "Test"}'
```

## Endpoint

- `POST /webhooks/openclaw` - Receives and verifies OpenClaw agent hook events
