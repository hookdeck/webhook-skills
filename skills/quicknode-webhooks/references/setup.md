# Setting Up Quicknode Webhooks

## Prerequisites

- A Quicknode account
- A public HTTPS endpoint for your handler (use the Hookdeck CLI while developing)

## Get Your Security Token

1. Open the Quicknode dashboard.
2. For a **Stream**, open the stream's **Settings** tab and copy its security token. For a **Webhook**, copy the security token shown for that webhook.
3. Store it as `QUICKNODE_WEBHOOK_SECRET`. The token is used as-is, as UTF-8 text: do not hex- or base64-decode it.

## Register Your Endpoint

1. Create a Stream (choose a chain, network and dataset) or a Webhook (choose a chain, network and filter template).
2. Set the destination to **Webhook** and enter your endpoint URL, for example `https://your-app.example.com/webhooks/quicknode`.
3. Keep payload compression (gzip) off on the stream or webhook: Quicknode signs the uncompressed body.
4. For Streams, review the delivery settings: timeout (default 30 s), retry interval (default 1 s) and number of retries before the stream pauses (default 3).

## Test Your Endpoint

Run the Hookdeck CLI to tunnel deliveries to your machine without an account:

```bash
npx hookdeck-cli listen 3000 quicknode --path /webhooks/quicknode   # Express, Next.js
npx hookdeck-cli listen 8000 quicknode --path /webhooks/quicknode   # FastAPI
```

Then point the stream or webhook at the Hookdeck URL and check that deliveries return `200`. A `401` means the signature check failed: see [verification.md](verification.md).

## Using Hookdeck as the Source

In Hookdeck, create a source of type **Quicknode** and paste the security token. Hookdeck verifies the same signature (HMAC SHA-256, `x-qn-signature`, hex) before forwarding.

> Keep payload compression (gzip) off on the stream or webhook: Quicknode signs the uncompressed body.
