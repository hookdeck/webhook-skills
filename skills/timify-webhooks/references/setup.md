# Setting Up TIMIFY Webhooks

## Prerequisites

- A TIMIFY Developer Platform account and an application
- The application scopes required by the webhooks you want (see [overview.md](overview.md))
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 timify --path /webhooks/timify` locally)

## Not Supported: Sync Webhooks

Sync-type webhooks, such as Before Confirmations, expect a synchronous answer and aren't supported.

Before Confirmations and Before Reminders have type `Sync`. Subscribe only to the `Created`,
`Updated` and `Deleted` webhooks.

## Create the Webhook Subscription

1. Open your application in the TIMIFY Developer Platform.
2. Make sure it has the scopes the events need (for example `Events`, `Customers`, `Resources`
   and `Services` for the Event webhook).
3. Select the **Webhooks Subscriptions** tab.
4. Create a webhook subscription and set its **Server URL** (e.g. `https://example.com/webhooks/timify`)
   and webhook scope.

You can create several subscriptions, each with its own Server URL and scope.

## Add the Secret Header

TIMIFY does not sign requests. To be able to authenticate them:

1. In the subscription, enable **Include header name**. TIMIFY then adds a custom HTTP header
   and secret value to every webhook request.
2. Enter a header name (for example `Authorization` or `X-Timify-Secret`) and a long random
   secret value.
3. Store them as `TIMIFY_WEBHOOK_HEADER` and `TIMIFY_WEBHOOK_SECRET`. The secret is the exact,
   whole header value: if you typed `Bearer abc123`, the secret is `Bearer abc123`.

The header is optional in TIMIFY, but without it anyone who finds your URL can post to it.

## Test

Create or change a booking, customer or resource that matches the subscription and check that
your endpoint logs the event. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/timify \
  -H "Content-Type: application/json" \
  -H "Authorization: $TIMIFY_WEBHOOK_SECRET" \
  -d '{"webhook":"Event","type":"Created","data":{"id":"evt_123"}}'
```

(The body is illustrative; replace it with a real delivery.)
