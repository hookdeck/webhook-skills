# Setting Up Arcadia Webhooks

## Prerequisites

- An Arcadia account with API access (Plug or Spark)
- A publicly reachable HTTPS endpoint (locally, use
  `npx hookdeck-cli listen 3000 arcadia --path /webhooks/arcadia`)

## Request an Authentication Header

Arcadia support sets the header name and value: open a support ticket to request one. Values cannot contain spaces.

Arcadia's documentation says custom header values must be set by Arcadia internally; they can't
be set through the API or the Dashboard. So:

1. Open a support ticket with Arcadia (Zendesk) asking for a custom webhook header.
2. Choose a header name such as `X-Arcadia-Token` and a long random value with no spaces.
   A `Bearer <token>` value is impossible because spaces aren't allowed.
3. Store them as `ARCADIA_WEBHOOK_HEADER` and `ARCADIA_WEBHOOK_SECRET`. The secret is the exact,
   whole header value.

The header applies to all webhooks in your organization.

## Register Your Endpoint

Register the webhook URL (for example `https://example.com/webhooks/arcadia`) with Arcadia as
described in the [webhooks documentation](https://docs.arcadia.com/reference/webhooks-overview),
or give it to Arcadia support in the same ticket. Arcadia sends `POST` requests and expects a 2xx
within 10 seconds.

## Test

Replay a documented payload with curl:

```bash
curl -X POST http://localhost:3000/webhooks/arcadia \
  -H "Content-Type: application/json" \
  -H "X-Arcadia-Token: $ARCADIA_WEBHOOK_SECRET" \
  -d '{"id":"whk_7606ece6-91cc-757d-b8bc-df676985fcfc","eventType":"DATA_DELETED","resource":"BUSINESS_UNIT_DELETION","createdAt":"2024-02-21T00:00:00.000+00:00","businessUnitIds":[],"errors":[],"data":{"totalAccountsMoved":4}}'
```

## Rotating the Value

Because only Arcadia support can change the header, rotation is also a support ticket. Update
`ARCADIA_WEBHOOK_SECRET` at the same moment the new value goes live, or every webhook returns 401.
