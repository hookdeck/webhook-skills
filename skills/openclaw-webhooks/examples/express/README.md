# OpenClaw Webhooks - Express Example

Minimal example of receiving OpenClaw Gateway webhooks with token verification.

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
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to localhost
hookdeck listen 3000 --path /webhooks/openclaw
```

Configure the Hookdeck URL in your external service or use it directly with `curl`.

### Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/openclaw \
  -H 'Authorization: Bearer your_hook_token_here' \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hello from test", "name": "Test"}'
```

## Endpoints

- `POST /webhooks/openclaw` - Receives agent hook events
- `POST /webhooks/openclaw/wake` - Receives wake events
- `GET /health` - Health check
