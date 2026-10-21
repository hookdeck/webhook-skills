# NinjaOne Webhooks - Next.js Example

Minimal example of receiving [NinjaOne](https://www.ninjaone.com/) activity webhooks in
Next.js, authenticated with a shared-secret header.

NinjaOne doesn't sign webhooks. The endpoint compares the `X-Webhook-Secret` header with
`NINJAONE_WEBHOOK_SECRET` (in `lib/ninjaone.ts`) using `crypto.timingSafeEqual`, returns `401` on a mismatch, and
returns `500` if the secret isn't configured.

## Prerequisites

- Node.js 18+
- A NinjaOne tenant and an API client (application) that can call `PUT /v2/webhook`
  (NinjaOne returns `403` unless it's a system administrator)
- A secret you generate yourself: `openssl rand -hex 32`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your secret in `.env` as `NINJAONE_WEBHOOK_SECRET`.

4. Register the webhook through the API, with the secret as a custom header
   (see [setup.md](../../references/setup.md)):
   ```bash
   curl -X PUT https://app.ninjarmm.com/v2/webhook \
     -H "Authorization: Bearer $NINJA_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://your-host/webhooks/ninjaone",
       "activities": { "CONDITION": ["TRIGGERED", "RESET"] },
       "headers": [{ "name": "X-Webhook-Secret", "value": "<your secret>" }]
     }'
   ```

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/ninjaone` (App Router route `app/webhooks/ninjaone/route.ts`).

## Test

Run the tests:

```bash
npm test
```

Receive real webhooks locally with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 ninjaone --path /webhooks/ninjaone
```

Use the URL it prints as the `url` in the `PUT /v2/webhook` call.
