# Setting Up Yousign Webhooks

## Prerequisites

- A Yousign account with API access (sandbox or production)
- A public HTTPS endpoint (self-signed certificates and private networks are rejected)

## Get Your Signing Secret

Each webhook subscription has its own secret key. Find it in the Yousign (Youtrust) app when viewing your webhook subscription. Store it as `YOUSIGN_WEBHOOK_SECRET`.

## Register Your Endpoint

1. Create a webhook subscription in the app (or via the API; see "Managing Webhook Subscriptions" in the [docs](https://developers.youtrust.com/docs/webhooks)).
2. Set the endpoint URL (for example `https://example.com/webhooks/yousign`).
3. Choose the environment: sandbox or production.
4. Select the events to receive. Recommended: `signature_request.activated`, `signature_request.done`, `signature_request.declined`, `signer.done`, `signer.declined`.

## Test Mode vs Live Mode

Use the sandbox environment to trigger test signature requests. Payloads from sandbox have `"sandbox": true`. Delete temporary subscriptions (for example webhook.site) after testing to avoid failed deliveries.

## Local Development

```bash
npx hookdeck-cli listen 3000 yousign --path /webhooks/yousign
```

Use port `8000` for FastAPI. Put the Hookdeck URL in your webhook subscription.

## Optional: IP Allowlist

Yousign documents the sending ranges `57.130.41.144/28` and `51.38.96.112/28`. Signature verification is the primary control; check the docs for the current list.
