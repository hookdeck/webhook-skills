# Segment Webhooks - Express Example

Minimal example of receiving Segment webhooks (Webhooks (Actions) or classic Webhooks destination) with `X-Signature` verification.

## Prerequisites

- Node.js 18+
- A Segment workspace with a Webhooks (Actions) destination and a **Shared Secret** set under Settings → Advanced Settings

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Segment Shared Secret to `.env` as `SEGMENT_SHARED_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 segment --path /webhooks/segment
```

Use the printed URL as the **URL** field of your Send mapping, then use the mapping's test step or send events to the connected source.

### Send a signed request by hand

```bash
BODY='{"type":"track","event":"Purchased an Item","userId":"019mr8mf4r","messageId":"test-1"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$SEGMENT_SHARED_SECRET" | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/segment \
  -H 'Content-Type: application/json' -H "X-Signature: $SIG" -d "$BODY"
```

### Run tests

```bash
npm test
```

## Batching

If **Enable Batching?** is on, Segment sends a JSON array and signs only the **first event**. The handler falls back to verifying `JSON.stringify(batch[0])`; only that first event is authenticated. See [../../references/verification.md](../../references/verification.md).

## Endpoint

- `POST /webhooks/segment` - Receives and verifies Segment calls (`track`, `identify`, `page`, `screen`, `group`, `alias`, and classic `delete`)
