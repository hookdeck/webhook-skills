# Setting Up JazzHR Webhooks

## Prerequisites

- A JazzHR account with access to Settings > Integrations
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 jazzhr --path /webhooks/jazzhr` locally)
- A secret key you generate yourself

## Add a Custom Integration

1. In JazzHR go to **Settings > Integrations** and click **Add Custom Integration**.
2. Fill in:
   - **Integration Name**: a unique name
   - **Integration [Webhook] URL**: your endpoint, including a unique client identifier if you serve several customers
   - **Secret Key**: used as the HMAC key for `X-JazzHR-Signature`. The docs call it optional "depending on the partner"; set one so you can verify requests
3. Click **Save**. JazzHR first POSTs a signed `VERIFY` event to the URL; your endpoint must return `200` or the integration isn't finalized.

Set the same secret as `JAZZHR_WEBHOOK_SECRET` in your handler.

## Trigger Exports

- **Manual**: on a candidate profile, choose **Export Candidate** (optionally set a Start Date).
- **Automatic**: add a Workflow Helper to a workflow step; candidates entering that step are exported.

## Test the Endpoint

JazzHR's docs give a curl for the verify event; the signature must be the HMAC of the exact body bytes:

```bash
BODY='{"data":"JazzHR Verify Event"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac 'secret-key' -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/jazzhr \
  -H 'X-JazzHR-Event: VERIFY' -H "X-JazzHR-Signature: $SIG" \
  -H 'Content-Type: application/json' --data-raw "$BODY"
```
