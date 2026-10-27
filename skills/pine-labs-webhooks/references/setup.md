# Setting Up Pine Labs Webhooks

## Prerequisites

- A Pine Labs Online merchant account (UAT/sandbox or production)
- A public HTTPS endpoint for your handler (use the Hookdeck CLI while developing)

## Get Your Secret Key

1. Sign in to the Pine Labs Online dashboard.
2. Open **Settings** and copy your secret key.
3. Store it in `PINE_LABS_WEBHOOK_SECRET` exactly as shown.

**Paste the secret key exactly as shown in the Pine Labs dashboard, without adding a whsec_ prefix.** That is Hookdeck's configuration alert for this source, quoted verbatim. Pine Labs uses the string as raw UTF-8 bytes for the HMAC key. If you paste a `whsec_`-prefixed value, the part after the prefix is base64-decoded and the signatures won't match.

## Register Your Endpoint

Pine Labs has no self-serve webhook subscription page in its docs. The URL is configured during onboarding:

1. Contact Pine Labs support and give them your HTTPS endpoint (for example `https://example.com/webhooks/pine-labs`).
2. Pine Labs registers it. No challenge or handshake request is documented.
3. Allowlist Pine Labs' NAT gateway IPs on your firewall, if you restrict inbound traffic. The current list (UAT and production) is on the [webhooks overview page](https://www.pinelabs.com/docs/online-payments/developer-tools/webhooks).

The docs describe no per-event subscription, so expect to receive every event type for your account and ignore the ones you don't handle (return `200`).

## Local Development

```bash
npx hookdeck-cli listen 3000 pine-labs --path /webhooks/pine-labs
```

Give the URL the CLI prints to Pine Labs support as the webhook URL for your UAT environment. Use port `8000` for FastAPI.

## Test Mode vs Live Mode

Pine Labs has separate UAT/sandbox and production environments with different NAT IPs. Confirm which secret key belongs to which environment before debugging a signature failure.
