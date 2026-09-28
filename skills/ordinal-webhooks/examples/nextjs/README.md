# Ordinal Webhooks - Next.js Example

Minimal example of receiving [Ordinal](https://www.tryordinal.com/) (tryordinal.com)
webhooks in a Next.js App Router route handler, authenticated with a **static
custom-header secret**.

**Ordinal does not sign webhook deliveries.** There is no signature header, no HMAC, no
signing secret and no timestamp. This example authenticates the *channel* by comparing a
header **you** configured on the webhook (`headers`) against `ORDINAL_WEBHOOK_SECRET` using
a constant-time compare, and **fails closed** when that secret is unset.

Because nothing is signed over the body, there is **no raw-body requirement** — calling
`await request.json()` directly is safe here. Do not copy the `request.text()` raw-body
dance from a signed provider.

## Prerequisites

- Node.js 18+
- An Ordinal workspace and a workspace API key (Settings → Integrations → API, [app.tryordinal.com/settings/integrations/api](https://app.tryordinal.com/settings/integrations/api)) to register the webhook
- A secret you generate yourself: `openssl rand -hex 32`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Generate a secret and put it in `.env.local` as `ORDINAL_WEBHOOK_SECRET`:
   ```bash
   openssl rand -hex 32
   ```

4. Register the webhook with that secret in its `headers`:
   ```bash
   curl -X POST "https://app.tryordinal.com/api/v1/webhooks" \
     -H "Authorization: Bearer $ORDINAL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"name":"CRM Sync","url":"https://<your-tunnel>/webhooks/ordinal",
          "topics":["post.published","post.publish_failed","post.approval.requested"],
          "headers":{"X-Webhook-Secret":"<the secret from step 3>"}}'
   ```

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/ordinal`
(`app/webhooks/ordinal/route.ts`).

## Test

```bash
npm test
```

Send a delivery by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ordinal \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $ORDINAL_WEBHOOK_SECRET" \
  -d '{"type":"post.published","data":{"post":{"id":"550e8400-e29b-41d4-a716-446655440001","title":"Q4 Product Launch Announcement","channel":"LinkedIn","postUrl":"https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678"}},"createdAt":"2025-02-26T14:30:00.000Z"}'
```

Omit the header and you get `401`. Ordinal documents **no test or `ping` event**, so real
traffic means performing the action in the app.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 ordinal --path /webhooks/ordinal
```

No account required — the CLI creates a guest account on first run and gives you a public
HTTPS URL to use as the webhook's `url`, plus a web UI for inspecting and replaying
requests.
