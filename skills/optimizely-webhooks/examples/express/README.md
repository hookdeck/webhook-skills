# Optimizely Webhooks - Express Example

Minimal example of receiving Optimizely Feature Experimentation webhooks with `X-Hub-Signature` (HMAC-SHA1) verification.

## Prerequisites

- Node.js 18+
- An Optimizely Feature Experimentation project with a webhook (Settings → Webhooks) and its secret token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook secret token to `.env` as `OPTIMIZELY_WEBHOOK_SECRET` (Optimizely shows it only once, right after the webhook is created)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 optimizely --path /webhooks/optimizely
```

Use the printed URL as the webhook URL in Optimizely, then publish a change to trigger `project.datafile_updated`.

### Send a signed request by hand

```bash
BODY='{"timestamp": 1558138293, "project_id": 1234, "data": {"environment": "Production", "revision": 13}, "event": "project.datafile_updated"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$OPTIMIZELY_WEBHOOK_SECRET" | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/optimizely \
  -H 'Content-Type: application/json' -H "X-Hub-Signature: sha1=$SIG" -d "$BODY"
```

### Run tests

```bash
npm test
```

The tests include the test vector published in Optimizely's docs. See [../../references/verification.md](../../references/verification.md).
