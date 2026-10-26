# Digital Samba Webhooks - Next.js Example

Minimal example of receiving Digital Samba webhooks and authenticating them with the `Authorization: Bearer <secret>` header.

Digital Samba does not sign payloads, so there is no HMAC to verify. The handler compares the bearer secret with `DIGITAL_SAMBA_WEBHOOK_SECRET` in constant time. A static credential authenticates the sender, not the body, and gives no replay protection. The route reads the body as text, so any content type works.

## Prerequisites

- Node.js 18+
- A Digital Samba webhook created with an `authorization_header` (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DIGITAL_SAMBA_WEBHOOK_SECRET` to the bare secret you used as `authorization_header`. Set authorization_header on the webhook through the Digital Samba REST API, then paste the same secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/digital-samba`.

## Test

```bash
npm test
```

The tests send documented-shape events with correct, wrong and missing secrets. No Digital Samba account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/digital-samba \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITAL_SAMBA_WEBHOOK_SECRET" \
  -d '{"eventType":"participant_joined","sessionId":"s1","roomId":"r1","timestamp":1675790387,"data":{"participantId":"p1","name":"John Smith","role":"moderator"}}'
```

## Receive Webhooks Locally

Digital Samba can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 digital-samba --path /webhooks/digital-samba
```

Use the printed URL as the webhook `endpoint`.

## How It Works

- `lib/verify-digital-samba.ts`: `verifyDigitalSambaRequest()`
- `app/webhooks/digital-samba/route.ts`: the `POST /webhooks/digital-samba` route

1. The bearer secret is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `eventType`: `participant_joined`, `participant_left`, `session_started`, `session_ended`, `recording_started`, `recording_stopped`, `recording_ready`, `recording_deleted`, `session_summary_ready`, `session_transcript_ready`.
4. It returns `200 {"received": true}`.
