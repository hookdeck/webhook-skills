# Setting Up MeasureOne Webhooks

## Prerequisites

- A MeasureOne account with API access
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 measureone --path /webhooks/measureone` locally)

## Choose a Secret Header

MeasureOne does not sign webhooks, so you authenticate them with a header of your choosing.

Add a static header to delivery_details.headers on the Data Request and enter it here. The JWT option fetches a new token for every delivery and cannot be checked.

1. Pick a header name (for example `Authorization` or `X-Webhook-Secret`) and a long random value.
   If you use `Authorization: Bearer <random>`, the whole string `Bearer <random>` is the value.
2. Store them as `MEASUREONE_WEBHOOK_HEADER` and `MEASUREONE_WEBHOOK_SECRET`. The secret is the
   exact, whole header value, including any `Bearer ` prefix.

## Register Your Endpoint

Webhooks are configured on each Data Request. When creating one (`POST /v3/datarequests/new`), pass
`delivery_details`:

```json
{
  "delivery_details": [
    {
      "event_type": "datarequest.report_complete",
      "url": "https://example.com/webhooks/measureone",
      "headers": { "X-Webhook-Secret": "Bearer your-shared-secret" }
    },
    {
      "event_type": "datarequest.items_available",
      "url": "https://example.com/webhooks/measureone",
      "headers": { "X-Webhook-Secret": "Bearer your-shared-secret" }
    }
  ]
}
```

Add the header to every entry; entries without it are delivered without the secret.

## About Basic and JWT Authorization

MeasureOne also supports Basic and JWT authorization for webhooks (credentials in
`delivery_details`, sent in the `Authorization` header). Basic is a fixed value, so treat it as the
static header: set the header name to `Authorization` and the value to the full `Basic <base64>`
string, in Hookdeck and in `MEASUREONE_WEBHOOK_SECRET`. The JWT option (`x_auth_token_credentials`)
fetches a new token from your endpoint before every delivery and retry, so there is no stored value
to compare against and it cannot be checked.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/measureone \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: Bearer your-shared-secret" \
  -d '{"event":"datarequest.items_available","datarequest_id":"dr_01","individual_id":"ind_01"}'
```

(Use the header name and value you configured.)

## In Hookdeck

Create a source of type **MeasureOne** and enter the Header Name and the exact whole Header Value.
Add a static header to delivery_details.headers on the Data Request and enter it here. The JWT option fetches a new token for every delivery and cannot be checked.
