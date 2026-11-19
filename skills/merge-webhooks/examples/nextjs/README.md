# Merge Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Merge](https://www.merge.dev) webhooks and verifying the `X-Merge-Webhook-Signature` HMAC.

## Prerequisites

- Node.js 18+
- A Merge account with access to the Webhooks configuration page (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MERGE_WEBHOOK_SIGNATURE_KEY` in `.env.local` to the signature key from the Security section of the Webhooks page.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/merge` in [app/webhooks/merge/route.ts](app/webhooks/merge/route.ts); the verification code is in [lib/verify-merge.ts](lib/verify-merge.ts).

## Test

```bash
npm test
```

The tests cover a vector computed with Merge's samples (padded, unpadded and standard base64), a valid padded signature, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 merge --path /webhooks/merge
```

Add the printed URL with **+Webhook** on the Merge Webhooks page, then click **Send test POST request**.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- Node's `digest('base64url')` has no `=` padding and Merge's header does. The example strips the padding before comparing.
