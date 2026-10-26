# Act-On Webhooks - Express Example

Minimal example of receiving [Act-On](https://www.act-on.com) outgoing webhooks with signature verification, using the [`svix`](https://www.npmjs.com/package/svix) library. Act-On delivers webhooks through an embedded Svix portal.

## Prerequisites

- Node.js 22+ (required by `svix` 2.x)
- An Act-On account with an Outgoing Webhook endpoint and its Signing Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's Signing Secret to `ACT_ON_WEBHOOK_SECRET` in `.env`. Paste the endpoint's Signing Secret from the Act-On webhook portal exactly as shown, including any whsec_ prefix.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/act-on`.

## Test

```bash
npm test
```

The tests sign payloads with Svix's algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`, and cover every event shape from Act-On's event catalog, tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, missing headers, redelivery dedupe, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 act-on --path /webhooks/act-on
```

In Act-On go to **Settings > Connectors > Custom Integrations > Outgoing Webhooks > Endpoints > + Add Endpoint**, paste the printed URL, subscribe the endpoint to the events you want, and use the **Testing** tab to send a sample.

## Notes

- This example is an ES module (`"type": "module"`) because `svix` 2.x ships ESM only.
- The route uses `express.raw({ type: '*/*' })`, so any content type works and the signature is checked against the exact bytes. Parse the body only after verification.
- Act-On's pages don't name the headers or the secret prefix. They are the Svix defaults (`svix-id`, `svix-timestamp`, `svix-signature`, `whsec_`), which is what Hookdeck's Act-On source assumes.
- Act-On payloads carry no event-type field. `classifyPayload` infers the type from the payload's shape; `contact.added`/`contact.updated`, `crm.connected`/`crm.disconnected` and the `subscription-category.added`/`deleted`/`updated` events share shapes, so use one endpoint per event type if you need to tell them apart.
- The Svix library always rejects timestamps more than 5 minutes old. Retries and replays through Hookdeck resend the original timestamp, so late retries fail verification. See `references/verification.md` for a manual verifier where the window can be dropped or widened.
- Deduplication uses `svix-id`, which is the same on every retry.
- If `ACT_ON_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
