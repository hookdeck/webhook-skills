# Setting Up RevenueCat Webhooks

## Prerequisites

- A RevenueCat project on the Pro plan (webhooks aren't available on legacy plans without it)
- A public HTTPS URL for your endpoint (use the Hookdeck CLI tunnel below for local development)

## Register Your Endpoint

1. In the RevenueCat dashboard, open your project and choose **Integrations** in the left menu.
2. Choose **Webhooks**, then **Add new configuration**.
3. Name the integration (names tell multiple webhook URLs apart).
4. Enter the HTTPS URL of your endpoint, e.g. `https://example.com/webhooks/revenuecat`.
5. (Optional, recommended) Set an **Authorization header** value. RevenueCat sends it as the `Authorization` header on every request. Use a long random value, for example `Bearer <random token>`, and store the same string as `REVENUECAT_WEBHOOK_AUTH`.
6. Choose whether to send events for production purchases, sandbox purchases, or both.
7. Choose whether to send events for one app or all apps in the project.
8. (Optional) Filter which event types are sent.

## Enable HMAC Signing (Recommended)

HMAC signing is **opt-in** per integration. Without it, the only authentication is the static Authorization header value.

1. Open the webhook integration in the dashboard.
2. Toggle **HMAC webhook signing** on.
3. Copy the signing secret and store it as `REVENUECAT_WEBHOOK_SECRET`. **It is shown only once**, at creation or rotation, and can't be retrieved later.
4. To replace it, click **Rotate secret**. The old secret is invalidated immediately, so deploy the new one straight away (expect `401`s, and RevenueCat retries, in between).

Once enabled, every delivery carries `X-RevenueCat-Webhook-Signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>`. See [verification.md](verification.md).

## Environment Variables

```bash
REVENUECAT_WEBHOOK_SECRET=your_revenuecat_signing_secret   # HMAC signing secret (if signing is enabled)
REVENUECAT_WEBHOOK_AUTH="Bearer your_authorization_header_value"  # Exact Authorization value (if set)
```

Set at least one. The examples check every value that's set and return `500` if neither is.

## Local Development

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 3000 revenuecat --path /webhooks/revenuecat   # Express / Next.js
npx hookdeck-cli listen 8000 revenuecat --path /webhooks/revenuecat   # FastAPI
```

Paste the printed URL into the integration's webhook URL field.

## Test Events and Sandbox

- **Send test event** on the integration page sends a `TEST` event with a purchase-like sample payload. It's signed like any other delivery when HMAC signing is on.
- Sandbox store purchases arrive with `environment: "SANDBOX"`. RevenueCat has no separate sandbox project; the value comes from the store transaction. Use separate integrations filtered by environment if production and testing go to different backends.
- Failed deliveries can be resent with **Retry** in the integration's event table or on the event details page.
