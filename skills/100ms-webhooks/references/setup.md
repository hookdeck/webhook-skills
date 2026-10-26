# Setting Up 100ms Webhooks

100ms webhooks are not signed. Add a secret header to the webhook in the 100ms dashboard and enter it here.

## Prerequisites

- A 100ms account (each workspace has its own webhook configuration)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 100ms --path /webhooks/100ms` locally)

## Choose a Secret Header

100ms passes the headers you configure to your endpoint unchanged. You pick both the name and the value:

1. Pick a header name, e.g. `Authorization` or `X-Webhook-Secret`.
2. Generate a long random value, e.g. `openssl rand -hex 32`. You may include a prefix such as
   `Bearer ` if you like; it is treated as part of the value.
3. Store them as environment variables:

```bash
HUNDRED_MS_WEBHOOK_HEADER=Authorization
HUNDRED_MS_WEBHOOK_SECRET=Bearer 3f1c...   # the exact, whole value
```

The prefix is `HUNDRED_MS` because an environment variable name can't start with a digit.

## Register Your Endpoint

1. Open the 100ms Dashboard and go to the **Developer** section.
2. Open **Webhook** and enter your URL (e.g. `https://example.com/webhooks/100ms`).
3. Add the secret header (name and value from above).
4. Save. 100ms posts events for the workspace to the URL.

The endpoint must accept `POST`, parse JSON and answer `200`. Anything else is retried three times.

## Optional: IP Allowlist

The 100ms docs list the NAT gateway IP addresses webhooks come from. Allowlist them at your
firewall for extra protection. This is in addition to the secret header, not a replacement.

## Test

Join and leave a room from a test app and check that `peer.join.success` and `peer.leave.success`
arrive. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/100ms \
  -H "Content-Type: application/json" \
  -H "Authorization: $HUNDRED_MS_WEBHOOK_SECRET" \
  -d '{"version":"2.0","id":"6c75de35-b778-4fb0-88ae-114c28dc285f","type":"peer.join.success","data":{"peer_id":"83b869e1","role":"host","user_name":"test user"}}'
```
