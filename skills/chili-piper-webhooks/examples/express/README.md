# Chili Piper Webhooks - Express Example

Minimal example of receiving Chili Piper webhooks with `X-Chili-Signature` verification (hex HMAC-SHA256 of `{X-Chili-Timestamp}.{raw body}`).

## Prerequisites

- Node.js 18+
- A Chili Piper account with a webhook created and enabled, and the signing secret from Chili Piper support

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook signing secret to `.env` as `CHILI_PIPER_WEBHOOK_SECRET`. Chili Piper issues the signing secret on request: email Chili Piper support for your tenant's secret and paste it here.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 chili-piper --path /webhooks/chili-piper
```

Use the printed URL as the webhook URL in the Command Center (Integrations → Custom Webhooks).

### Send a signed request by hand

```bash
BODY='{"meetingIdChili":"123e4567-e89b-12d3-a456-426614174000","type":"Created"}'
TS=$(date +%s)
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$CHILI_PIPER_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST http://localhost:3000/webhooks/chili-piper \
  -H 'Content-Type: application/json' \
  -H "X-Chili-Timestamp: $TS" -H "X-Chili-Signature: $SIG" -d "$BODY"
```

### Run tests

```bash
npm test
```

## Event types

The body's `type` field is `Created` (new meeting), `Updated` (rescheduled or reassigned) or `Deleted` (canceled). The handler dispatches on it.

## Optional replay protection

The handler does not reject old timestamps by default, because Hookdeck retries and replays resend the original headers. Set `CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS` (for example `300`, as in Chili Piper's example) to reject requests whose `X-Chili-Timestamp` is further than that from the current time.

## Endpoint

- `POST /webhooks/chili-piper` - Receives and verifies Chili Piper webhooks
