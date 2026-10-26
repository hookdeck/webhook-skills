# Setting Up Tripletex Webhooks

## Prerequisites

- A Tripletex account with API access and a session token (see Tripletex's
  [authentication docs](https://developer.tripletex.no/docs/documentation/authentication-and-tokens/))
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 tripletex --path /webhooks/tripletex` locally)

## Choose an Authentication Header

Subscriptions are created through the API only. Pick a header name and a long random value:

- `authHeaderName`: e.g. `Authorization` (the examples default to this) or a custom name such as `X-Webhook-Secret`
- `authHeaderValue`: e.g. `Bearer <long random string>`

Tripletex sends this header **as-is** on every callback. Store the name as
`TRIPLETEX_WEBHOOK_HEADER` and the exact value, including any `Bearer ` prefix you typed, as
`TRIPLETEX_WEBHOOK_SECRET`.

## Register Your Endpoint

List the available events:

```bash
curl -X GET --header 'Accept: application/json' --header 'Authorization: Basic <base64 of 0:sessionToken>' \
  'https://tripletex.no/v2/event'
```

Create one subscription per event:

```bash
curl -X POST 'https://tripletex.no/v2/event/subscription' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Basic <base64 of 0:sessionToken>' \
  --data '{
    "event": "customer.create",
    "targetUrl": "https://your.receiver/webhooks/tripletex",
    "fields": "*",
    "authHeaderName": "Authorization",
    "authHeaderValue": "Bearer <long random string>"
  }'
```

`fields` is optional and uses the same format as the API (`*,currency(*)`). Recommended events to
start with: `invoice.charged`, `customer.create`, `customer.update`, `order.create`,
`order.update`, `product.create`, `product.update`, `product.delete`.

Give a new subscription a few seconds to propagate, then do an initial sync from the matching
`GET /v2/...` endpoint.

## Other Authentication Options (not covered by this skill)

Tripletex also supports Basic credentials in the `targetUrl`
(`https://user:pass@host/path`) and a secret in the query or path (`?token=...`). The custom header
is the recommended option and the only one these examples handle.

## Check Subscription Status

```bash
curl --header 'Authorization: Basic <base64 of 0:sessionToken>' 'https://tripletex.no/v2/event/subscription'
```

`status` is `ACTIVE`, or `DISABLED_TOO_MANY_ERRORS` after about a week of failed deliveries. Set it
back with `PUT /v2/event/subscription/{id}`.

## Test

Create a customer or product in a test account and check that your endpoint logs `customer.create`
or `product.create`. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/tripletex \
  -H "Content-Type: application/json" \
  -H "Authorization: $TRIPLETEX_WEBHOOK_SECRET" \
  -d '{"subscriptionId":42,"event":"customer.create","id":1001,"value":{"id":1001,"name":"Acme AS"}}'
```
