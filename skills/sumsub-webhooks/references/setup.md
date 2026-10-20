# Setting Up Sumsub Webhooks

## Prerequisites

- A Sumsub account with access to **Dev space** in the Dashboard
- A public **HTTPS** endpoint (Sumsub rejects HTTP and internal hosts). For local development use the Hookdeck CLI tunnel below.

## Create a Webhook and Get the Secret Key

1. In the Sumsub Dashboard, open **Dev space → Webhooks → Webhook manager** and click **Create webhook**.
2. **Name**: any label.
3. **Receiver type**: **HTTP address**.
4. **Target**: your endpoint, e.g. `https://your-app.example.com/webhooks/sumsub`.
5. **Type**: the event to receive (e.g. `applicantReviewed`). Each webhook covers one type, so create one per event you need (up to 50 active webhooks).
6. **Applicant types**: Individuals, Companies, or both.
7. **Secret key**: Sumsub generates one, or you can enter your own. Copy it into `SUMSUB_WEBHOOK_SECRET`. It is used verbatim as the HMAC key.
8. **Signature algorithm**: **SHA256** (default) or **SHA512**. Your handler reads the choice from `x-payload-digest-alg`, so either works.
9. Optional: **HTTP Headers** for custom key/value headers, **Source keys**, and **Rollout percentage**.
10. Keep **Resend failed webhooks several times** enabled so failed deliveries are retried.
11. Click **Test webhook**, then **Save**.

> Webhooks have separate secret keys. If you use different keys for different webhook types but one endpoint, your handler must look up the key per webhook, e.g. by giving each webhook its own path or a custom HTTP header.

## Upgrading Legacy SHA1 Webhooks

Webhooks created before SHA256 became the default, with no algorithm explicitly chosen, still sign with `HMAC_SHA1_HEX`. Edit the webhook and select **SHA256** or **SHA512** to upgrade. A handler that reads `x-payload-digest-alg` keeps working throughout.

## Test Mode vs Sandbox

- **Test webhook** in the Webhook manager sends a signed delivery with `"testMode": true` in the body. Production deliveries never include `testMode`.
- The **Sandbox** environment sends real events for test applicants with `"sandboxMode": true`.

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 sumsub --path /webhooks/sumsub

# FastAPI
npx hookdeck-cli listen 8000 sumsub --path /webhooks/sumsub
```

No account is required. The CLI prints a public HTTPS URL. Use it as the webhook **Target**, then click **Test webhook**.

## Requirements Checklist

- HTTPS with TLS 1.2+
- Accept the connection within 1 second and respond within 10 seconds
- Don't require authorization that Sumsub can't send. Use the digest, or a custom HTTP header configured on the webhook.
- Don't allowlist Sumsub IP addresses. Sumsub says they may change.
