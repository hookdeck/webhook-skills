# Act-On Webhooks - Next.js Example

Minimal example of receiving [Act-On](https://www.act-on.com) outgoing webhooks with signature verification, using the [`svix`](https://www.npmjs.com/package/svix) library and the Next.js App Router. Act-On delivers webhooks through an embedded Svix portal.

## Prerequisites

- Node.js 22+
- An Act-On account with an Outgoing Webhook endpoint and its Signing Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the endpoint's Signing Secret to `ACT_ON_WEBHOOK_SECRET` in `.env.local`. Paste the endpoint's Signing Secret from the Act-On webhook portal exactly as shown, including any whsec_ prefix.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/act-on` (see `app/webhooks/act-on/route.ts`).

## Test

```bash
npm test
```

The tests call the route handler directly with payloads signed using Svix's algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`. They cover every event shape from Act-On's event catalog, tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, missing headers, redelivery dedupe, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 act-on --path /webhooks/act-on
```

In Act-On go to **Settings > Connectors > Custom Integrations > Outgoing Webhooks > Endpoints > + Add Endpoint**, paste the printed URL, subscribe the endpoint to the events you want, and use the **Testing** tab to send a sample.

## Notes

- The handler reads `await request.text()` and verifies that. The signature covers the exact raw body, so don't verify `request.json()`. Any content type works.
- Act-On's pages don't name the headers or the secret prefix. They are the Svix defaults (`svix-id`, `svix-timestamp`, `svix-signature`, `whsec_`), which is what Hookdeck's Act-On source assumes.
- Act-On payloads carry no event-type field. `classifyPayload` infers the type from the payload's shape; `contact.added`/`contact.updated`, `crm.connected`/`crm.disconnected` and the `subscription-category.added`/`deleted`/`updated` events share shapes, so use one endpoint per event type if you need to tell them apart.
- The Svix library always rejects timestamps more than 5 minutes old. Retries and replays through Hookdeck resend the original timestamp, so late retries fail verification. See `references/verification.md` for a manual verifier where the window can be dropped or widened.
- Deduplication uses `svix-id`, which is the same on every retry.
- If `ACT_ON_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
