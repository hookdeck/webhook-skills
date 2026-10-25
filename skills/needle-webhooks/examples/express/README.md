# Needle Webhooks - Express Example

Minimal example of receiving [Needle](https://needle.app) webhooks with signature verification. Needle's headers follow Standard Webhooks, so this example verifies with the [`standardwebhooks`](https://github.com/standard-webhooks/standard-webhooks) library.

## Prerequisites

- Node.js 18+
- A Needle workspace and a webhook with its signing secret (`whsec_...`). See [setup](../../references/setup.md).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook secret in `NEEDLE_WEBHOOK_SECRET`. Needle shows it only once, when you add the webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/needle`.

## Test

```bash
npm test
```

The tests sign payloads the Standard Webhooks way (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`) and cover `lead_created`, `linkedin_message_received`, `enrollment_completed`, multiple signatures, tampered bodies, stale timestamps, resent events and the fail-closed path when no secret is set.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 needle --path /webhooks/needle
```

Use the printed `https://` URL as the webhook URL in Settings > Integrations, then trigger an event (for example create a lead).

## Notes

- The route uses `express.raw({ type: '*/*' })`, so any content type works and the exact bytes are verified. Parse the body only after the check.
- If `NEEDLE_WEBHOOK_SECRET` is unset the handler returns `500` and never accepts unverified requests.
- Needle keeps the `webhook-id` when it resends an event, so the handler dedupes on it and returns `200` for duplicates. Events are unordered; use the body's `timestamp` for ordering.
- The library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so a late one fails (Needle's own retries carry a fresh timestamp). See [verification.md](../../references/verification.md) for a manual verifier without that window.
