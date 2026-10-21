# Instantly Webhooks - Express Example

Minimal example of receiving Instantly webhooks and authenticating them.
Instantly doesn't sign webhooks, so this example checks the custom header you
attach to the webhook in Instantly (for example `Authorization: Basic ...` or
`X-Instantly-Secret: <random>`) with a constant-time compare of the whole value.

## Prerequisites

- Node.js 18+
- An Instantly workspace on the Hyper Growth plan or above

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set the header you added to the webhook in Instantly
   (Integrations → Webhooks → **Add headers**, or the API v2 `headers` object):
   - `INSTANTLY_WEBHOOK_HEADER`: the header name (default `Authorization`)
   - `INSTANTLY_WEBHOOK_SECRET`: the exact value, including any `Basic ` prefix

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/instantly`.

## Test

```bash
npm test
```

The tests send the exact header Instantly would send (Basic Auth and a custom
secret header) and cover a wrong value, a value without its `Basic ` prefix,
a missing header, an unconfigured secret, invalid JSON, and every documented
`event_type` plus a custom label.

Send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/instantly \
  -H "Authorization: $INSTANTLY_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-10-20T21:44:23.244Z","event_type":"reply_received","workspace":"ws_1","campaign_id":"c_1","campaign_name":"Q4 Outbound","lead_email":"jane@example.com","reply_text_snippet":"Sounds interesting"}'
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 instantly --path /webhooks/instantly
```

No account required. Paste the printed HTTPS URL into the **Webhook URL** in
Instantly, add the same header you put in `.env`, then trigger an event or
call `POST /api/v2/webhooks/{id}/test`.

## Notes

- The handler is in `src/index.js`.
- Compare the **whole** header value, scheme included.
- There's no signature, timestamp header or event ID, so deduplicate on
  `event_type` + `timestamp` + `lead_email` + `campaign_id`.
- Custom lead labels arrive with the label name as `event_type`; the handler
  logs them in its default branch.
- See [../../references/verification.md](../../references/verification.md)
  for details and debugging.
