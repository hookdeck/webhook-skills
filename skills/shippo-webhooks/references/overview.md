# Shippo Webhooks Overview

## What Are Shippo Webhooks?

Shippo is a multi-carrier shipping API (labels, rates, tracking). Instead of
polling for tracking updates, label purchases, or batch results, you register a
webhook URL and Shippo `POST`s a JSON payload to it when something changes.

When you buy a label through Shippo, Shippo automatically creates a tracking
webhook for that label.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `track_updated` | A carrier reports a tracking status change | Update order status, send "out for delivery"/"delivered" emails, flag exceptions |
| `transaction_created` | A transaction (label purchase) is created | Store label URL and tracking number, print labels |
| `transaction_updated` | A transaction changes (e.g. status, tracking status) | Sync label state, detect refunds or errors |
| `batch_created` | An async batch has finished creating its shipments | Review batch, then purchase it |
| `batch_purchased` | An async batch purchase completes | Download the merged label PDF (up to 100 labels per file) |
| `automations_label_resolved` | A Shippo Automations label request reaches a terminal state (`purchased`, `dry_run_completed`, `no_match`, `failed`) | Fulfil the order, alert on failures |
| `all` | Subscription option only: delivers every event above | Single endpoint for everything |

Notes from Shippo's docs:

- Shippo polls carriers and sends `track_updated` when the status changes.
  Updates usually arrive within about 2 hours of the carrier event.
- For API version `2017-03-29` and older, `track_updated` may carry the
  Transaction object if the label was created on Shippo.
- `automations_label_resolved` is delivered **once with no retry**, but may still
  arrive more than once, so dedupe on `data.request_id`. Poll
  `GET /automations/labels/{request_id}` for the authoritative result.

## Event Payload Structure

Every payload has the same envelope:

```json
{
  "event": "track_updated",
  "test": true,
  "data": {
    "carrier": "usps",
    "tracking_number": "9205590164917312751089",
    "metadata": "Order 000123",
    "tracking_status": {
      "status": "DELIVERED",
      "substatus": { "code": "information_received", "action_required": false },
      "status_date": "2016-07-23T00:00:00Z",
      "status_details": "Your shipment has been delivered at the destination mailbox."
    },
    "tracking_history": [ /* ... */ ]
  }
}
```

| Field | Description |
|-------|-------------|
| `event` | Event type string (see table above) |
| `test` | `true` for test-mode objects / test webhooks |
| `data` | The Tracking or Transaction object, the Automations result, or for batch events a short string such as `"batch # processing complete"` |

Tracking `status` values include `PRE_TRANSIT`, `TRANSIT`, `DELIVERED`,
`RETURNED`, `FAILURE`, and `UNKNOWN`.

Headers to note:

- `Shippo-API-Version`: the API version used to render the payload
- `Shippo-Auth-Signature`: only present when HMAC is set up for your account

## Delivery Behavior

- Respond `2xx` within **3 seconds**.
- On timeout, `408`, `429`, or `5xx`, Shippo **retries twice**. Other `4xx`
  responses are not retried.
- There is no unique event ID, so build idempotency on natural keys.

## Full Event Reference

For the complete reference and sample payloads, see
[Shippo's webhook documentation](https://docs.goshippo.com/docs/Tracking/Webhooks).
