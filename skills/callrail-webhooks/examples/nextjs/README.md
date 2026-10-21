# CallRail Webhooks - Next.js Example

Minimal example of receiving CallRail webhooks with `Signature` verification (base64 HMAC-SHA1 of the raw body).

## Prerequisites

- Node.js 18+
- A CallRail account with the company **signing key** from the Webhooks configuration page

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your CallRail company signing key to `.env` as `CALLRAIL_SIGNING_KEY`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 callrail --path /webhooks/callrail
```

Use the printed URL as the webhook URL in CallRail (Settings → Integrations → Webhooks).

### Send a signed request by hand

```bash
BODY='{"id":879204976,"source_number":"770-555-5555","destination_number":"770-123-4567","content":"Hello","message_type":"sms","media_urls":[],"timestamp":"2026-01-01T12:00:00.000-05:00"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$CALLRAIL_SIGNING_KEY" -binary | base64)
curl -X POST http://localhost:3000/webhooks/callrail \
  -H 'Content-Type: application/json' -H "Signature: $SIG" -d "$BODY"
```

To check your signature code, sign the request body from the [CallRail docs](https://apidocs.callrail.com/#webhooks) with the test key `072e77e426f92738a72fe23c4d1953b4`. The result should be `UZAHbUdfm3GqL7qzilGozGzWV64=`.

### Run tests

```bash
npm test
```

## Event types

CallRail does not send an event type in the body or in a header. The event is decided by which webhook URL you registered it on. Add `?callrail_event=post_call` (or `pre_call`, `answered_call`, `updated_call`, `post_outbound_call`, `updated_outbound_call`, `sms_received`, `sms_sent`, `form_captured`) to each URL. Without the hint, the handler infers the event from the payload shape. Pre-call, call routing complete and post-call share one call object and are reported as `call`.

## Optional replay protection

Set `CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS` to reject requests whose body `timestamp` (or `submitted_at` for forms) is too far from the current time. It is off by default. The `timestamp` of a call is its start time and post-call webhooks can arrive up to 20 minutes after hangup, so use a window of at least an hour.

## Endpoint

- `POST /webhooks/callrail` - Receives and verifies CallRail webhooks
