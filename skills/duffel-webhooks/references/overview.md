# Duffel Webhooks Overview

## What Are Duffel Webhooks?

Duffel is a travel (flights) API. A webhook is an HTTPS endpoint you register with `POST /air/webhooks`. Duffel sends it a JSON event whenever something happens in your account, for example when an airline changes the schedule of one of your orders. Live mode and test mode have separate webhooks, chosen by the access token used to create them.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ping.triggered` | You call `POST /air/webhooks/id/{id}/actions/ping` | Test that your receiver works |
| `order.created` | An order is created | Save the booking, email the customer |
| `order.airline_initiated_change_detected` | An airline changes the schedule of an order | Notify the customer, trigger re-accommodation |
| `order_cancellation.confirmed` | An order cancellation is confirmed | Issue refunds, update records |
| `payment.succeeded` | A payment succeeds | Mark the order as paid |

Duffel's guide also shows `order.updated`. Subscribe only to the events you need when creating the webhook.

## Event Payload Structure

```json
{
  "id": "wev_0000A6VP9fgKxAccTSKWUy",
  "type": "order.airline_initiated_change_detected",
  "object": "order",
  "live_mode": false,
  "idempotency_key": "aic_0000ApoiwggSbt7BordU1o",
  "created_at": "2021-04-22T13:13:18.420272Z",
  "data": { "object": { } }
}
```

- `type` names the event.
- `data.object` holds the affected resource.
- `idempotency_key` identifies the underlying change. Retries can send duplicates, so use it to dedupe.

## Full Event Reference

See [Duffel's receiving webhooks guide](https://duffel.com/docs/guides/receiving-webhooks).
