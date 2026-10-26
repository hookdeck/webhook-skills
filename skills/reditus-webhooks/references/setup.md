# Setting Up Reditus Webhooks

## Prerequisites

- A Reditus account with the affiliate and/or referral program
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 reditus --path /webhooks/reditus`)

## Get Your Webhook Secret

Reditus's docs don't say where the webhook secret is shown or how it is set. Check your Reditus dashboard or ask Reditus support, then store the value as `REDITUS_WEBHOOK_SECRET`. It is used as-is, as UTF-8 bytes (not hex- or base64-decoded).

## Register Your Endpoint

Add your endpoint URL for the events you want. The docs describe five: `partnership.accepted`, `referral.created`, `advocate.created`, `lead.created` and `reward.created`. They don't describe the dashboard steps, so follow what Reditus shows you.

## HTTP Method

Reditus's docs don't name the HTTP method. The examples accept GET, POST, PUT, PATCH and DELETE on `/webhooks/reditus` and verify the signature on each. If you receive through Hookdeck, note that Hookdeck's Reditus source pre-selects POST without managing the method, so any other method Reditus uses must also be allowed on the source.

## Test

Sign a body yourself and send it:

```bash
BODY='{"event_type":"lead.created","url":"destination-url@example.com","created_at":"2024-05-05","data":{"lead_id":"6412-smga-1314-munw","lead_email":"john@example.com"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$REDITUS_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/reditus \
  -H "Content-Type: application/json" -H "X-Signature: $SIG" -d "$BODY"
```
