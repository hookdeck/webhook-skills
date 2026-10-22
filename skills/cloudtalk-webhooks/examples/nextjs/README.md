# CloudTalk Webhooks - Next.js Example

Minimal example of receiving [CloudTalk](https://www.cloudtalk.io) webhooks with signature verification, using the open-source [`svix`](https://www.npmjs.com/package/svix) library. CloudTalk's account-level webhooks are signed with the Svix scheme.

## Prerequisites

- Node.js 22+ (required by `svix` 2.x)
- A CloudTalk account on the Essential plan or higher, with an Admin role (to create webhook endpoints)
- The endpoint's signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your signing secret to `CLOUDTALK_WEBHOOK_SECRET` in `.env.local`. Find it under **Settings → Webhooks**: open the endpoint and reveal its signing secret (see [setup](../../references/setup.md)).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/cloudtalk` (see `app/webhooks/cloudtalk/route.ts`).

## Test

```bash
npm test
```

The tests sign payloads with CloudTalk's (Svix's) algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`, and cover all 22 event types, tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, any content type, missing headers, `event_id` deduplication, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 cloudtalk --path /webhooks/cloudtalk
```

Add the printed URL as an endpoint under **Settings → Webhooks**, then use **Send test event** to confirm a `2xx`.

## Notes

- The handler reads `await request.text()` and verifies that. The signature covers the exact raw body, so don't verify `request.json()`.
- `svix` 2.x `verify()` returns nothing and throws on failure. The handler parses the JSON itself after verification.
- If `CLOUDTALK_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- CloudTalk needs a `2xx` within **15 seconds**; enqueue the event and process it asynchronously in production.
- Dedupe on the envelope `event_id`. Delivery is at-least-once and retries (up to 50 over ~11.5 hours) reuse both `event_id` and `svix-id`. Keep ids for 30 days, since Resend and Recover reach back that far.
- Only account-level webhooks (Settings → Webhooks) are signed this way. The Call Flow Designer **Webhook** step, an AI Voice Agent's **Send via Webhook** option and Workflow Automation actions are not, so this handler will reject them.
