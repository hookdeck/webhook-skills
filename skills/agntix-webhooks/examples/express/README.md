# Agntix Webhooks - Express Example

Minimal example of receiving [Agntix](https://agntix.ai) webhooks with signature verification, using the official [`svix`](https://www.npmjs.com/package/svix) library (Agntix delivers webhooks through Svix).

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
   cp .env.example .env
   ```

3. Add your endpoint's signing secret to `AGNTIX_WEBHOOK_SECRET` in `.env` (the full `whsec_...` value). See [setup](../../references/setup.md).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/agntix`.

## Test

```bash
npm test
```

The tests sign payloads with Svix's algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`, and cover `session.created` and `session.ended`, tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, missing headers, deduplication and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 agntix --path /webhooks/agntix
```

Add the printed URL as an endpoint in the Agntix dashboard (**Developer → + Add Endpoint**), subscribe to `session.created` and `session.ended`, then start a call or chat session.

## Notes

- This example is an ES module (`"type": "module"`) because `svix` 2.x ships ESM only.
- The route uses `express.raw({ type: '*/*' })`, so any content type works and the exact bytes are verified. JSON is parsed only after the check.
- `svix` 2.x `verify()` returns nothing and throws on failure. `verifyAgntixWebhook` parses the JSON itself afterwards.
- The Svix library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late retries are rejected. See [verification](../../references/verification.md) for a manual verifier where the window can be dropped or widened.
- If `AGNTIX_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- The payload's top-level `id` is the session UUID and is shared by `session.created` and `session.ended`, so deduplication keys on `eventType` + `id`.
- Agntix needs a `2xx` within **15 seconds**. Enqueue the event and process it asynchronously in production.
