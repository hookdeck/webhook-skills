# Firstbase Webhooks Overview

## What Are Firstbase Webhooks?

Firstbase manages equipment for remote employees. Its webhooks push a notification to your
HTTPS endpoint when an order, return order or inventory order changes, so you don't have to poll
the API. Each notification is **thin**: it names the change and the resource id, and you fetch the
details from the Firstbase API.

Requests are `POST` with a JSON body. Respond with any `2xx` to acknowledge. The endpoint must be
HTTPS with a valid certificate.

Webhooks are **not signed**. Authentication is the secret header you configure with **Custom
header** authentication (see [setup.md](setup.md) and [verification.md](verification.md)).

## Event Types

| eventType | Triggered When | Common Use Cases |
|-----------|----------------|------------------|
| `CREATED` | An order, return order or inventory order is created | Start fulfilment tracking, notify the employee |
| `UPDATED` | One of those resources changes | Sync status, shipment or return progress |
| `DELETED` | One of those resources is deleted | Remove or archive the local record |

Notifications are sent per resource type: orders, return orders and inventory orders.

## Event Payload Structure

```json
{
  "eventType": "CREATED",
  "id": "ord_12345"
}
```

The example is illustrative: it shows the documented parts (an `eventType` of `CREATED`, `UPDATED`
or `DELETED`, and the resource id). The exact name of the id field and how the resource type is
conveyed are not confirmed here, so capture one real delivery (for example with
`npx hookdeck-cli listen 3000 firstbase --path /webhooks/firstbase`) and adjust the handler's
`payload.id` reads to match.

## Full Event Reference

See [Firstbase's webhook documentation](https://support.firstbase.com/hc/en-us/articles/40623853911191-Setting-up-Webhooks).
