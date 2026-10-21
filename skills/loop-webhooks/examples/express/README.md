# Loop Webhooks - Express Example

Minimal example of receiving [Loop](https://loop.com) (freight audit and
logistics payments) webhooks with signature verification. Loop delivers
webhooks through Svix, so verification uses the official
[`svix`](https://docs.svix.com/receiving/verifying-payloads/how) SDK.

## Prerequisites

- Node.js 20+
- A Loop webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LOOP_WEBHOOK_SECRET` to the endpoint's signing secret from Loop's
   webhook portal (secrets are unique per endpoint).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook endpoint is:

```
POST http://localhost:3000/webhooks/loop
```

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm Loop uses (HMAC-SHA256 over
`{svix-id}.{svix-timestamp}.{raw body}`, base64) and check the signing helper
against the example signature in Loop's docs. They cover every documented
event type, rotated (multi-signature) headers, tampered bodies, stale
timestamps, and deduplication on `eventId`.

## Receive Real Loop Webhooks Locally

Use the Hookdeck CLI to get a public URL that tunnels to this server (no
account required):

```bash
npx hookdeck-cli listen 3000 loop --path /webhooks/loop
```

Add the printed URL as an endpoint in Loop's webhook portal, then use the
**Testing** tab to send a `test-event.created` event.

## How It Works

See [`src/index.js`](src/index.js):

1. Reads the **raw** body (Loop signs the exact string it sent).
2. Verifies `svix-id`, `svix-timestamp` and `svix-signature` with the Svix
   SDK, which also rejects timestamps more than 5 minutes old.
3. Parses the JSON and skips events whose `eventId` was already processed.
   Loop recommends deduplicating on the payload `eventId`, not `svix-id`.
4. Dispatches on the top-level `eventType` and returns `200`.
