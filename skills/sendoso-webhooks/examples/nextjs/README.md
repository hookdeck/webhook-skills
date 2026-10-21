# Sendoso Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Sendoso](https://sendoso.com) send status webhooks with Svix signature verification, using the official [`svix`](https://www.npmjs.com/package/svix) package.

## Prerequisites

- Node.js 20.9+
- Sendoso webhooks enabled for your organization (email developers@sendoso.com)
- An endpoint in the Sendoso webhooks portal (linked from the integrations page) and its `whsec_` signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your endpoint's signing secret to `SENDOSO_WEBHOOK_SECRET` in `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/sendoso` ([app/webhooks/sendoso/route.ts](app/webhooks/sendoso/route.ts)).

## Test

```bash
npm test
```

The tests call the route handler directly and sign payloads with Sendoso's Svix algorithm (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`). They cover tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, duplicate and out-of-order deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 sendoso --path /webhooks/sendoso
```

Add the printed URL as an endpoint in the Sendoso webhooks portal, copy that endpoint's signing secret into your env file, then send an example event from the endpoint's **Testing** tab.

## Notes

- The handler reads `await request.text()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- In `svix` 2.x, `Webhook.verify()` throws on failure and returns nothing, so the handler parses the body only after verification succeeds.
- Every Sendoso event type shares the documented payload `{ "send_gid", "status_changed_at" }`, and that payload doesn't name the event type. Subscribe the endpoint only to the events it should act on (or look the send up by `send_gid`). The handler dedupes on `svix-id` and ignores updates whose `status_changed_at` is older than the last one it saw for that send.
- If `SENDOSO_WEBHOOK_SECRET` is unset, the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Sendoso times out after **15 seconds**. In production, enqueue the work and respond right away.
