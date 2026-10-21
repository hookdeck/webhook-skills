# OpenClaw Webhooks - Next.js Example

Minimal example of receiving OpenClaw automation webhooks in a Next.js App Router route. It receives the POST OpenClaw sends when an automation (cron job) finishes, and verifies `Authorization: Bearer <webhookToken>` by comparing the whole header value in constant time.

## Prerequisites

- Node.js 18+
- An OpenClaw Gateway with `cron.webhookToken` set

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `OPENCLAW_WEBHOOK_TOKEN` in `.env` to the Gateway's `cron.webhookToken`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Run Tests

```bash
npm test
```

The tests cover finished events (succeeded and failed), failure alerts, a wrong or missing token, the bare token without `Bearer `, invalid JSON, and a missing `OPENCLAW_WEBHOOK_TOKEN`.

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 openclaw --path /webhooks/openclaw
```

Then point an automation at the tunnel URL:

```bash
openclaw automations edit <jobId> --webhook <tunnel-url>
openclaw automations run <jobId> --wait
```

### Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/openclaw \
  -H 'Authorization: Bearer your_webhook_token_here' \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"job_123","action":"finished","runId":"run_abc","status":"ok","completionStatus":"succeeded","summary":"Test run"}'
```

## Endpoints

- `POST /webhooks/openclaw` - Receives automation finished events and failure alerts
