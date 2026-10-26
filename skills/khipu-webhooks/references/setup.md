# Setting Up Khipu Webhooks

## Prerequisites

- A Khipu collecting account with API access (the same account that creates the collections)
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

> Only notifications API version 3.0 is supported. Version 1.3 notifications aren't signed this way and fail verification.

## Register Your Endpoint

Khipu has no dashboard webhook list for this: the endpoint is set per collection through the instant payments API.

1. Create a collection (payment request) and include:
   - `notify_url`: your HTTPS endpoint, e.g. `https://example.com/webhooks/khipu`
   - `notify_api_version`: `"3.0"`
2. When the payment is reconciled, Khipu POSTs the payment's data to `notify_url` with an `x-khipu-signature` header.

Collections created without `notify_api_version` `"3.0"` use the 1.3 notification, which sends a `notification_token` and is not signed this way.

## Get Your Signing Secret

The signing key is the **merchant secret** of the collecting account (the account used to create the collection). Set it as `KHIPU_WEBHOOK_SECRET`. It is used as-is, as UTF-8 bytes.

## Local Development with Hookdeck

```bash
npx hookdeck-cli listen 3000 khipu --path /webhooks/khipu
```

Use the Hookdeck URL as `notify_url`. When creating the Hookdeck source, pick the **Khipu** source type so Hookdeck verifies the signature as well.

## Testing

Create a collection against the staging environment with `notify_api_version` `"3.0"` and pay it with the demo bank. The documented test payload uses subject `TEST_COBRO` and bank `DemoBank`.
