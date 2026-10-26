# Agntix Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Agntix](https://agntix.ai) webhooks with signature verification, using the official [`svix`](https://www.npmjs.com/package/svix) library (Agntix delivers webhooks through Svix).

## Prerequisites

- Node.js 22+ (required by `svix` 2.x)
- An Agntix account and an endpoint signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your endpoint's signing secret to `AGNTIX_WEBHOOK_SECRET` in `.env.local` (the full `whsec_...` value). See [setup](../../references/setup.md).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/agntix` (see `app/webhooks/agntix/route.ts`).

## Test

```bash
npm test
```

The tests call the route handler directly with payloads signed using Svix's algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`. They cover `session.created` and `session.ended`, tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, missing headers, deduplication and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 agntix --path /webhooks/agntix
```

Add the printed URL as an endpoint in the Agntix dashboard (**Developer → + Add Endpoint**), subscribe to `session.created` and `session.ended`, then start a call or chat session.

## Notes

- The handler reads `await request.text()` and verifies that. The signature covers the exact raw body, so don't verify `request.json()`.
- `svix` 2.x `verify()` returns nothing and throws on failure. The handler parses the JSON itself after verification.
- The Svix library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late retries are rejected. See [verification](../../references/verification.md) for a manual verifier where the window can be dropped or widened.
- If `AGNTIX_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- The payload's top-level `id` is the session UUID and is shared by `session.created` and `session.ended`, so deduplication keys on `eventType` + `id`.
- Agntix needs a `2xx` within **15 seconds**. Enqueue the event and process it asynchronously in production.
