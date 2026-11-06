# Duffel Webhooks Overview

## What Are Duffel Webhooks?

Duffel is a travel API for flights, stays and cars. A webhook is an HTTPS endpoint you register with `POST /air/webhooks`. Duffel sends it a JSON event whenever something happens in your account, for example when an airline changes the schedule of one of your orders. Live mode and test mode have separate webhooks, chosen by the access token used to create them.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ping.triggered` | You call `POST /air/webhooks/{id}/actions/ping` | Test that your receiver works |
| `order.created` | An order is created | Save the booking, email the customer |
| `order.airline_initiated_change_detected` | An airline changes the schedule of an order | Notify the customer, trigger re-accommodation |
| `order_cancellation.confirmed` | An order cancellation is confirmed | Issue refunds, update records |
| `air.payment.succeeded` | An air payment succeeds | Fetch the payment by `data.object.payment_id` and update your records |

Duffel's sample handler also mentions `order.updated`, which isn't in the current list of event types. Subscribe only to the events you need when creating the webhook.

## Event Payload Structure

```json
{
  "id": "wev_0000A6VP9fgKxAccTSKWUy",
  "type": "order.airline_initiated_change_detected",
  "live_mode": false,
  "idempotency_key": "aic_00001876aqC8c5umZmrRds",
  "created_at": "2021-04-22T13:13:18.420272Z",
  "data": {
    "object": {
      "id": "ord_00009hthhsUZ8W4LxQgkjo",
      "aic_id": "aic_00001876aqC8c5umZmrRds"
    }
  }
}
```

- `type` names the event.
- `data.object` holds identifiers, not the full resource. The field names differ by event: `id` and `offer_id` on `order.created`, `payment_id` on `air.payment.*`, `order_id` on `air.order.changed`. Fetch the record from the API.
- `idempotency_key` is Duffel's identifier for the related object. Retries can send duplicates, so use it to dedupe.

## Full Event Reference

See [Duffel's webhook events reference](https://duffel.com/docs/api/v2/webhook-events).
