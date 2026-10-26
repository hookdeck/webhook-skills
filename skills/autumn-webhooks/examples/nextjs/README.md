# Autumn Webhooks - Next.js Example

Minimal example of receiving [Autumn](https://useautumn.com) webhooks with signature verification in the Next.js App Router, using the [`svix`](https://www.npmjs.com/package/svix) library Autumn's docs recommend, plus a manual verifier for when the library's fixed 5-minute timestamp window gets in the way.

## Prerequisites

- Node.js 22+ (required by `svix` 2.x)
- An Autumn account and a webhook signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Autumn webhook signing secret to `AUTUMN_WEBHOOK_SECRET` in `.env.local`. Autumn shows it **once**: when you add the endpoint in the dashboard, or in the response of `webhooks.create` / `webhooks.sync`. `webhooks.get` never returns it (see [setup](../../references/setup.md)).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/autumn` (`app/webhooks/autumn/route.ts`; verification lives in `lib/autumn.ts`).

## Test

```bash
npm test
```

The tests sign payloads with Autumn's (Svix's) algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`, and cover each event type, tampered bodies, wrong secrets, stale timestamps (svix rejects them, the manual verifier with a wider or no window accepts them), multiple signatures, missing headers, non-JSON content types, `svix-id` deduplication, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 autumn --path /webhooks/autumn
```

Add the printed URL as an endpoint in the Autumn dashboard (**Developer → Webhooks → Add Endpoint**; Autumn requires https and rejects localhost), then use **Send Test Event**.

## Notes

- The route reads `await request.text()`, so any content type verifies against the exact bytes. Never verify `request.json()`.
- `svix` 2.x `verify()` returns nothing and throws on failure. `verifyAutumnWebhook` parses the JSON itself afterwards.
- **Retries and replays:** the svix library always rejects a `svix-timestamp` older than 5 minutes. Hookdeck retries and replays resend the original timestamp, so late retries fail. Set `AUTUMN_TIMESTAMP_TOLERANCE_SECONDS` to a number of seconds (or `off`) to use the manual verifier instead. Keep deduplicating on `svix-id`.
- If `AUTUMN_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
