# Setting Up Rebrandly Webhooks

> Rebrandly webhooks are not signed. Add an authentication header to the webhook and enter it here.

## Prerequisites

- A Rebrandly account (Clickstream requires an enterprise arrangement with Rebrandly)
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 rebrandly --path /webhooks/rebrandly`)

## Choose the Authentication Header

You pick the header name and value; Rebrandly sends them on every request.

- **Clickstream:** provide Rebrandly with the endpoint URL, the HTTP method (POST or PUT) and the
  authentication header key and value.
- **Self-serve Webhooks (account settings):** add the webhook and its secret header. Rebrandly's own
  blog gives the header name inconsistently (`X-Rebrandly-Secret` and `apikey`), so send one test
  delivery, look at which header arrives, and set `REBRANDLY_WEBHOOK_HEADER` to that name.

Store the header name as `REBRANDLY_WEBHOOK_HEADER` (default `Authorization`) and the **exact,
whole value** as `REBRANDLY_WEBHOOK_SECRET`. If you typed `Bearer abc`, the secret is `Bearer abc`.

## Hookdeck Source

In Hookdeck choose the **Rebrandly** source type. It uses API key verification: Header Name plus
the exact whole Header Value. Hookdeck's Rebrandly source pre-selects POST without managing the
method, so if Rebrandly uses PUT (or any other method), allow that method on the source too.

## Test

```bash
curl -X PUT http://localhost:3000/webhooks/rebrandly \
  -H "Content-Type: application/json" \
  -H "Authorization: $REBRANDLY_WEBHOOK_SECRET" \
  -d '{"data":[{"timestamp":"2019-07-02T14:07:06.981094Z","route":{"id":"a1ec86bf91bfe763ad02f602259ea0a9"}}],"key":"abcxyz123"}'
```

## Network Notes

Use HTTPS. There is no signature or timestamp, so a leaked credential lets anyone post to your
endpoint: rotate it at Rebrandly and in `REBRANDLY_WEBHOOK_SECRET` together.
