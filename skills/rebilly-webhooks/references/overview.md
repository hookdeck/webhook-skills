# Rebilly Webhooks Overview

## What Are Rebilly Webhooks?

Rebilly (subscription billing) sends an HTTP request to a URL you configure whenever selected
events happen in your organization. Each webhook has a URL, an HTTP method (one of GET, POST, PUT,
PATCH or DELETE), an events filter (empty means all events), optional headers, optional
credentials and an optional body template.

If the webhook has HTTP basic access authentication credentials, Rebilly also sends an
`Authorization: Basic base64(username:password)` header with each request. Every webhook is also
signed (see [verification.md](verification.md)), but Hookdeck's Rebilly source checks only basic auth.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `transaction-processed` | A transaction is processed | Fulfil orders, record payments |
| `transaction-declined` | A transaction is declined | Dunning, notify the customer |
| `customer-created` | A customer is created | Create the matching account |
| `subscription-activated` | A subscription is activated | Grant access |
| `subscription-canceled` | A subscription is canceled | Schedule access removal |
| `invoice-issued` | An invoice is issued | Email or store the invoice |
| `invoice-paid` | An invoice is paid | Mark the order as paid |
| `data-export-completed` | A data export is completed | Download the exported file |

Rebilly defines many more (`customer-updated`, `subscription-renewed`, `invoice-past-due`,
`transaction-refunded`, `dispute-created`, ...). The handlers log and acknowledge unknown events
with `200`, so adding an events filter is optional.

## Event Payload Structure

The default payload is JSON with the event name in `eventType`, the ids of the affected resources,
and HAL `_embedded` / `_links` sections:

```json
{
  "dataExportId": "d9dd134f-0bee-46b1-bec0-992da3173336",
  "fileId": "d348968b-41ed-4d7d-b534-02e5265c8912",
  "eventType": "data-export-completed",
  "_embedded": { "dataExport": { "id": "d9dd134f-0bee-46b1-bec0-992da3173336", "status": "pending", "_links": [] } },
  "_links": [
    { "rel": "dataExport", "href": "https://api-sandbox.rebilly.com/organizations/.../experimental/data-exports/d9dd134f-..." },
    { "rel": "download", "href": "https://api-sandbox.rebilly.com/organizations/.../files/d348968b-.../download" }
  ]
}
```

A webhook's optional body template replaces this default payload, so a templated webhook may not
have `eventType`. Requests also carry `webhook-id` (the same on every retry), `webhook-timestamp`
and `webhook-signature` headers, and a `User-Agent` of the form `Rebilly/<release>`.

## Delivery

Rebilly retries unless the response is exactly HTTP 200 (not 202 or 204), and also when there is no
response within 20 seconds. Retries come after about 5 minutes, then about 1, 2, 4, 8 and 16 hours,
up to 6 retries. Webhooks may be delayed or delivered more than once, and ordering isn't guaranteed.

## Full Event Reference

For the complete list of events, see [Rebilly's webhook documentation](https://www.rebilly.com/docs/dev-docs/webhooks-configuration)
and the `eventsFilter` values in [Rebilly's API catalog](https://www.rebilly.com/_spec/catalog/all.yaml).
