# Setting Up Paylocity Webhooks

## Prerequisites

- Approved access to the Webhooks API Early Access program
- Sandbox OAuth client credentials
- An HTTPS endpoint (use the Hookdeck CLI locally)

## Create a Subscription

Subscriptions are created through the API, not a dashboard:

```http
POST /apiHub/webhooks/v1/subscriptions
```

Set `url` to your endpoint (for example `https://your-app.example.com/webhooks/paylocity`), choose the event types, and set `auth.type` to `HMAC` (the only allowed value). See [Create Subscription](https://developer.paylocity.com/integrations/reference/post_apihub_webhooks_v1_subscriptions).

The response contains the HMAC key's secret in `auth.hmac.key1.secret`. **Paylocity returns it only once.** Store it in `PAYLOCITY_HMAC_SECRET` exactly as returned: it's base64, and your handler decodes it.

## Optional Timestamp Check

Paylocity recommends rejecting a request whose `x-pcty-timestamp` is more than 300 seconds from your clock. The examples skip the check unless you set:

```bash
PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS=300
```

Keep your server clock in sync (NTP) if you turn it on.

## Rotate Keys

A subscription can hold two keys (`key1`, `key2`). While both are active, Paylocity signs every delivery with both, so:

1. Create the second key and store its secret (again returned once).
2. Switch `PAYLOCITY_HMAC_SECRET` to the new secret.
3. Let the old key expire. If both keys expire, Paylocity stops delivering.

## Test

Change an employee in the sandbox company (for example an assignment) and check that your endpoint returns `2xx`.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 paylocity --path /webhooks/paylocity
```

Use the printed URL as the subscription `url`.

## Using Hookdeck

Create a source with the **Paylocity** source type and paste the HMAC secret exactly as returned. Hookdeck decodes the base64, verifies each `signature=` pair against `<x-pcty-timestamp>.<body>`, and accepts the request if any pair matches, so it keeps verifying during rotation with either secret. Paste the new secret into the source before the old key expires. Verification is optional on the source, and Hookdeck applies no timestamp window.
