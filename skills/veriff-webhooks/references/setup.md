# Setting Up Veriff Webhooks

## Prerequisites

- A Veriff account with access to the Veriff Customer Portal (Veriff's back office; depending on your setup it's at `station.veriff.com` or `hub.veriff.com`, so use the address in your sign-up email)
- A publicly reachable **HTTPS** endpoint. Veriff rejects plain HTTP and custom ports in webhook URLs.

## How Do I Register a Webhook URL?

1. Log in to the Veriff Customer Portal.
2. Open **Integrations** (or **All Integrations**) and select the integration.
3. Open the **Settings** tab.
4. Under **Integration settings**, fill in the webhook URLs you need:
   - **Webhook decisions URL**: decision webhook (required for most products)
   - **Webhook events URL**: event webhook (optional)
5. Save, e.g. `https://example.com/webhooks/veriff`.

The URL fields shown depend on your integration. You can point both fields at the same endpoint: the example handlers tell the two payloads apart by shape.

Use a **test** integration while developing.

## Where Do I Find the Shared Secret Key?

The shared secret key (sometimes called the "API private key" or "Private key") is shown in the Customer Portal under **Integrations** → your integration. It is a secret credential and is not the same as the API key.

```bash
VERIFF_SHARED_SECRET=your_shared_secret_key
```

| Credential | Where Veriff uses it | Use for webhooks |
|------------|----------------------|------------------|
| API key (public) | `X-AUTH-CLIENT` header | Identifies the integration only |
| Shared secret key (private) | HMAC key for `X-HMAC-SIGNATURE` | Verify every webhook |

Each integration has its own pair. If you receive webhooks from several integrations, pick the secret that matches the integration (`X-AUTH-CLIENT` carries its API key).

## Optional: IP Allowlisting

Veriff has an IP range for webhook listeners. Ask your Veriff Solutions Engineer for it. Treat this as defense in depth on top of signature verification, not a replacement.

## How Do I Test Locally?

Start a tunnel with the Hookdeck CLI (no account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 veriff --path /webhooks/veriff

# FastAPI
npx hookdeck-cli listen 8000 veriff --path /webhooks/veriff
```

Paste the tunnel URL into the Webhook decisions URL field, then:

1. Create a verification session in your test integration.
2. Open the session URL and go through the flow.
3. In the Veriff environment, force the session status to `approved` or `declined`.
4. Your endpoint receives the decision webhook.

To replay a delivery, open the session in the Customer Portal → **Webhooks** tab → select the webhook → **Details**. It shows the **Raw body** and request headers, which is useful for debugging a signature mismatch.

## Production Checklist

- Endpoint is HTTPS and answers `200` in well under 5 seconds (do the work asynchronously)
- Signature verification is on and uses the raw body
- Handler is idempotent (at-least-once delivery) and tolerates out-of-order delivery
- Secret is stored outside source control
