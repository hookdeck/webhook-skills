# ClickPost Webhooks Overview

## What Are ClickPost Webhooks?

ClickPost is a shipment tracking platform for e-commerce. Its status webhooks push a JSON `POST`
to your URL each time a shipment gets a new scan. You choose **Selected Status** (only the
statuses you pick) or **All Status**. Requests are authenticated with a shared token, not a
signature.

## Common Status Codes

Dispatch on `clickpost_status_code` (an integer).

| Code | Description | Common Use Cases |
|------|-------------|------------------|
| 1 | OrderPlaced | Record the order with the carrier |
| 2 | PickupPending | Show "awaiting pickup" |
| 4 | PickedUp | Send a shipped notification |
| 5 | InTransit | Update tracking timeline |
| 6 | OutForDelivery | Notify the customer |
| 8 | Delivered | Close the order, trigger review request |
| 9 | FailedDelivery | Start a reattempt / NDR flow |
| 41 | RiderAllocationFailed | Alert ops |
| 42 | RiderAllocated | Show rider assigned |
| 43 | ReachedPickupLocation | Update tracking timeline |
| 44 | ReachedDropLocation | Update tracking timeline |
| 47 | PartialRTOOutForDelivery | Partial return handling |
| 48 | PartialDelivered | Partial delivery handling |
| 50 | PartialRTO | Partial return handling |
| 52 | PartialRTODelivered | Partial return handling |

## Payload Structure

```json
{
  "waybill": "TEST-AWB-HLD-123",
  "cp_id": 10001,
  "status": "ARRIVED",
  "remark": "ARRIVED",
  "location": "Pushpak_Nagar",
  "timestamp": "2024-11-19T10:04:20Z",
  "clickpost_status_code": 43,
  "clickpost_status_description": "ReachedPickupLocation",
  "additional": {
    "notification_event_id": 94,
    "latest_status": { "clickpost_status_code": 43, "clickpost_status_description": "ReachedPickupLocation", "timestamp": "2024-11-19T10:04:20Z" },
    "is_rvp": false,
    "order_id": "TESTORDERHLD123"
  }
}
```

Some payloads carry more fields (bucket, coordinates, rider details, ...). Always read fields
defensively.

## Delivery Notes

- Method is `POST`. Respond `200`, `201`, `202` or `204` within 5 seconds.
- Scans may arrive out of order. Dedupe on `waybill` + scan and keep the latest state by scan `timestamp`.

## Full Reference

- [ClickPost webhook documentation](https://docs.clickpost.ai/docs/tracking-a-shipment-using-webhook)
- [All Status webhook](https://docs.clickpost.ai/docs/all-status-webhook)
