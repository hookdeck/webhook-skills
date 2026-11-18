# Merge Webhooks - Express Example

Minimal Express example of receiving [Merge](https://www.merge.dev) webhooks and verifying the `X-Merge-Webhook-Signature` HMAC.

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
   cp .env.example .env
   ```

3. Set `MERGE_WEBHOOK_SIGNATURE_KEY` in `.env` to the signature key from the Security section of the Webhooks page.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/merge` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover a vector computed with Merge's samples, the unpadded form, standard base64 (rejected), a valid padded signature, an event without a linked account, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 merge --path /webhooks/merge
```

Add the printed URL with **+Webhook** on the Merge Webhooks page, then click **Send test POST request**.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so `express.json()` on this route breaks it.
- Node's `digest('base64url')` has no `=` padding and Merge's header does. The example strips the padding before comparing.
