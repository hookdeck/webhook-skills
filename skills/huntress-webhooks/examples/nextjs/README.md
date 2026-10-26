# Huntress Webhooks - Next.js Example

Minimal example of receiving Huntress webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Huntress signs webhooks with Svix).

## Prerequisites

- Node.js 18+
- Huntress account with the account admin role (needed to configure webhooks) and an endpoint signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Huntress signing secret to `.env.local` as `HUNTRESS_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/huntress
```

The route reads the body with `request.text()`, so verification uses the exact bytes
Huntress signed, whatever `Content-Type` the request carries.

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Huntress uses
(`{svix-id}.{svix-timestamp}.{raw body}`).

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 huntress --path /webhooks/huntress
```

1. In the Huntress Portal, open **Integrations → Add an Integration → Webhooks → Add Endpoint** and paste the tunnel URL (must be HTTPS).
2. Choose the notification categories you want, then save.
3. From the endpoint's three-dot menu, choose **View Signing Secret** and copy it into `.env.local`.
4. Choose **Send Test** from the same menu.

## Event Handling

Huntress's webhook article describes the body only as a JSON payload and does not
list event type strings. The handler therefore verifies first, then logs the body and
reports `type` if the body has one. Add cases for the type values you actually see in
**View Delivery Attempts → Request Body**.

## Timestamp Window

`svix` always rejects timestamps more than 5 minutes old. Hookdeck retries and replays
resend the original timestamp, so late retries fail here. If that matters, use the
manual verifier in [references/verification.md](../../references/verification.md), where
the window can be dropped or widened.
