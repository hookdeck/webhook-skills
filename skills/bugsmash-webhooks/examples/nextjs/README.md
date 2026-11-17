# BugSmash Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [BugSmash](https://bugsmash.io) webhooks with signature verification (HMAC-SHA256 over `{X-Webhook-Timestamp}.{raw body}`).

## Prerequisites

- Node.js 18+
- A BugSmash API key, and the `secret_key` returned when you create the webhook (shown only once, see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the whole `secret_key`, including the `bgsmsh_` prefix, in `BUGSMASH_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route ([app/webhooks/bugsmash/route.ts](app/webhooks/bugsmash/route.ts)) exports GET, POST, PUT, PATCH and DELETE handlers because BugSmash's docs don't name the HTTP method. It reads `await request.arrayBuffer()`, so the exact bytes are verified and a missing body counts as empty.

## Test

```bash
npm test
```

The tests call the route handlers directly and sign payloads the way BugSmash does (`hex(HMAC-SHA256(secret_key, "{timestamp}.{raw body}"))`). They cover all four events, every method, an empty GET body, raw (non-re-serialised) bodies, tampering, a wrong or prefix-stripped secret, missing or malformed headers, and the opt-in timestamp tolerance (`BUGSMASH_WEBHOOK_TOLERANCE_SECONDS`, off by default).

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 bugsmash --path /webhooks/bugsmash
```

Use the printed URL as `webhookUrl` in `POST https://api.bugsmash.io/api/v2/webhook`, then call `POST /webhook/test` to send a signed sample event.

## Notes

- The handler reads the event name from `event`, as in BugSmash's help center examples, and treats `comment_replied` (the API's name) and `new_reply_on_comment` (the help center's) as the same reply event.
- No timestamp window by default, because Hookdeck retries and replays resend the original timestamp.
