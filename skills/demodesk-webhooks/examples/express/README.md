# Demodesk Webhooks - Express Example

Minimal example of receiving Demodesk webhooks and authenticating them with a custom header.

Demodesk does not sign payloads, so there is no HMAC to verify. You add a custom header (name and
value of your choice) to the webhook endpoint in Demodesk. The handler compares that header's
whole value with `DEMODESK_WEBHOOK_SECRET` using a constant-time comparison. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the value if it leaks.

## Prerequisites

- Node.js 18+
- A Demodesk account with the Demodesk API and admin rights (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DEMODESK_WEBHOOK_HEADER` to the custom header name you added to the webhook endpoint
   (default `Authorization`) and `DEMODESK_WEBHOOK_SECRET` to its exact, whole value (including
   `Bearer ` if you typed it).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/demodesk`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing header values. No Demodesk
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/demodesk \
  -H "Content-Type: application/json" \
  -H "$DEMODESK_WEBHOOK_HEADER: $DEMODESK_WEBHOOK_SECRET" \
  -d '{"meta":{"event":{"action":"demo.scheduled"}},"data":{}}'
```

## Receive Webhooks Locally

Demodesk can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 demodesk --path /webhooks/demodesk
```

Put the printed URL in the Demodesk webhook endpoint.

## How It Works

- `src/index.js`: `verifyDemodeskRequest()` plus the `POST /webhooks/demodesk` route

1. The custom header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `meta.event.action`: `demo.scheduled`, `demo.rescheduled`,
   `demo.event_response_updated`, `demo.handovered`, `demo.canceled`, `demo.started`,
   `demo.call_note_updated`, `demo.ended`, `recording.uploaded`,
   `recording.transcription_postprocessed`.
4. It returns `200 {"received": true}`.
