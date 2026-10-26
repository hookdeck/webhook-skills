# VTEX Webhooks Overview

## What Are VTEX Webhooks?

The Orders API **Hook** (Feed v3 and Hook) is VTEX's push counterpart to the order feed. Instead of
polling a queue, you give VTEX a URL and it POSTs a notification whenever an order update matches
your filter. Each `appKey` can configure only one hook; VTEX removes the configuration if the hook
has no notifications for three days, so you must configure it again. If a delivery fails, VTEX
retries on an internal geometric progression. Your endpoint must answer `200` within 5000 ms.

Requests are not signed. The hook configuration has a `headers` object whose entries VTEX sends with
every notification, which is where your secret header goes.

## Common Event Types

The event is the order status in the `State` field.

| `State` | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| `order-created` | The order is created | Create the order in an ERP |
| `on-order-completed` | The purchase was processed at checkout; the order data is complete | Confirm the order downstream |
| `payment-pending` | Payment is awaiting confirmation | Hold fulfillment |
| `payment-approved` | Payment is approved | Release the order for fulfillment |
| `waiting-ffmt-authorization` | Fulfillment authorization is awaited | Approve or reject fulfillment |
| `ready-for-handling` | The order is ready for the seller to handle | Create a pick/pack task |
| `start-handling` | Handling is about to start | Reserve stock |
| `handling` | The order is being handled | Update tracking status |
| `invoiced` | An invoice was issued | Send the invoice, trigger shipping |
| `cancel` | Cancellation workflow status | Stop fulfillment |
| `canceled` | The order was canceled | Restock, refund |

These are the API status names from VTEX's [order flow and status table](https://help.vtex.com/en/docs/tutorials/order-flow-and-status),
which has more statuses than this table. The Orders Feed guide's `FromWorkflow` filter example
spells this status `order-completed`, which the status table doesn't list; check the `State` your
hook actually sends. Always return `200` for states you don't handle.

## Event Payload Structure

```json
{
  "Domain": "Marketplace",
  "OrderId": "v40484048naf-01",
  "State": "payment-approved",
  "LastChange": "2019-07-29T23:17:30.0617185Z",
  "Origin": { "Account": "accountABC", "Key": "vtexappkey-keyEDF" }
}
```

| Field | Meaning |
|-------|---------|
| `Domain` | Where the order lives (e.g. `Marketplace`) |
| `OrderId` | The order to fetch from the Orders API |
| `State` | The order status |
| `LastChange` | A timestamp of the order's last change (the docs give only the sample value) |
| `Origin.Account` / `Origin.Key` | The account and appKey the hook belongs to |

The notification only identifies the order and its status. Fetch the full order from the Orders API
with `OrderId`.

## Setup Ping

When you save the hook configuration VTEX POSTs `{"hookConfig": "ping"}` to your URL and needs a
`200`; otherwise the configuration call returns `400 Bad Request`. Reply `200` and do nothing else.

## Full Event Reference

See [VTEX's Feed v3 and Hook guide](https://developers.vtex.com/docs/guides/orders-feed).
