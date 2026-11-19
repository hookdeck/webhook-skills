# 360Learning Webhooks - Next.js Example

Minimal Next.js example of receiving [360Learning](https://360learning.readme.io/docs/webhooks) webhooks with signature verification (Standard Webhooks format via Svix, base64-decoded secret).

## Prerequisites

- Node.js 18+
- A 360Learning admin account, or an API client with the `webhooks:write` and `webhookSecrets:read` scopes

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `THREE_SIXTY_LEARNING_WEBHOOK_SECRET` to the subscription's signing secret (Settings > Webhooks > **See secret**, or `GET /api/v2/webhooks/subscriptions/{id}/secrets`; see [setup](../../references/setup.md)). Paste it as shown, with or without a `whsec_` prefix. Each subscription covers one event type and has its own secret: if this route receives several subscriptions, list every secret, comma-separated.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/360learning` in [app/webhooks/360learning/route.ts](app/webhooks/360learning/route.ts).

## Test

```bash
npm test
```

The tests sign requests the way 360Learning does. They check the Standard Webhooks reference vector (with and without `whsec_`, and end to end), a body that `JSON.stringify(JSON.parse(body))` would change, `user.created`, `path.session.user.status.updated` and an `xapi.started` statement, several subscription secrets, two signatures during a rotation, a secret used without decoding, tampered bodies, the optional timestamp window, retries (same `webhook-id`), and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 360learning --path /webhooks/360learning
```

Create a subscription with the printed URL (Settings > Webhooks > **Create subscription**, or `POST /api/v2/webhooks/subscriptions`), then trigger the event in 360Learning, for example by creating a user for `user.created`.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The signature covers the exact raw body, so `request.json()` before verifying breaks it. 360Learning's own Node sample signs `JSON.stringify(req.body)`, which only works while re-serialising reproduces the bytes that were sent.
- If `THREE_SIXTY_LEARNING_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- `THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS` turns on a timestamp window (360Learning suggests 5 minutes). It's off by default because a delivery replayed later through a relay keeps its original timestamp; duplicates are caught by `webhook-id` instead.
- Respond within 15 seconds. Non-`2xx` responses, redirects included, are retried up to 7 times over about 27.5 hours.
