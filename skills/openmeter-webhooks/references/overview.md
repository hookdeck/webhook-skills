# OpenMeter Webhooks Overview

## What Are OpenMeter Webhooks?

OpenMeter is an open-source usage metering and billing platform (now part of
Kong). Its **Notifications** feature turns metering and billing state changes
into webhooks so your backend doesn't have to poll. Notifications are built
from three entities:

| Entity | Description |
|--------|-------------|
| **Channel** | Where notifications go. The only channel type is `WEBHOOK`: an HTTP `POST` to a URL you choose, signed via Svix. You can add custom HTTP headers. |
| **Rule** | Which condition triggers an event (rule type = event type), and which channels receive it. |
| **Event** | A notification produced when a rule matches. It is delivered to each channel and is also queryable at `/api/v1/notification/events` with delivery status. |

## Which OpenMeter Event Types Exist?

These four strings are the complete `NotificationEventType` enum in OpenMeter's
OpenAPI spec:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `entitlements.balance.threshold` | Usage of a metered entitlement crosses a configured threshold (`PERCENT` or `NUMBER`). Fires at most once per entitlement per threshold; re-evaluated on grants, voided grants and resets. | Email customers at 80%, block access at 100%, alert sales on overage of a soft limit |
| `entitlements.reset` | A metered entitlement is reset, manually via the Reset API or automatically at the end of its usage period | Clear "over quota" flags, restore access, start a new usage cycle |
| `invoice.created` | A new invoice is generated (gathering invoices are not supported) | Sync invoices to accounting or an external invoicing system |
| `invoice.updated` | An existing invoice changes state, one event per state transition (e.g. `draft.created` → `draft.sync`) | Chase overdue or uncollectible invoices, handle validation issues |

Balance-threshold and reset rules can be filtered to specific features; invoice
rules take no extra parameters.

## What Does the Event Payload Look Like?

Every event uses the same envelope:

```json
{
  "id": "01J5WQFP993XTYM1HAZH3SHP2G",
  "timestamp": "2024-08-22T09:43:03.209883Z",
  "type": "entitlements.balance.threshold",
  "data": { "...": "..." }
}
```

- `id` — the OpenMeter event ID (ULID). Use it for idempotency.
- `timestamp` — when the event was created (RFC 3339).
- `type` — one of the four event types above.
- `data` — event-specific, self-contained context so you don't need extra API calls.

### Entitlement events (`entitlements.balance.threshold`, `entitlements.reset`)

`data` contains `entitlement`, `feature`, `subject` and `value`; threshold events
also include `threshold`:

```json
{
  "data": {
    "entitlement": { "id": "01J5WM25BAXSCBKG2D9NDYJB6S", "featureKey": "llm_tokens", "subjectKey": "notification-test-2", "type": "metered", "isSoftLimit": false, "currentUsagePeriod": { "from": "2024-08-22T08:43:00Z", "to": "2024-08-29T08:43:00Z" } },
    "feature": { "id": "01J5WKAM9FJ4621ARR641JS17Q", "key": "llm_tokens", "meterSlug": "tokens_total", "name": "llm_tokens" },
    "subject": { "id": "01J5WM256DNGXKG2N17AHVXKTD", "key": "notification-test-2", "metadata": {} },
    "threshold": { "type": "NUMBER", "value": 2000 },
    "value": { "balance": 254, "hasAccess": true, "overage": 0, "usage": 2369 }
  },
  "id": "01J5WQFP993XTYM1HAZH3SHP2G",
  "timestamp": "2024-08-22T09:43:03.209883Z",
  "type": "entitlements.balance.threshold"
}
```

For `entitlements.reset`, `value` holds the entitlement values right after the reset.

### Invoice events (`invoice.created`, `invoice.updated`)

`data` is the invoice exactly as the Get Invoice API returns it:

```json
{
  "id": "01JSJ98SQWRQXEER4PZNQ5PX26",
  "timestamp": "2025-04-23T21:36:09.468991Z",
  "type": "invoice.updated",
  "data": {
    "id": "01JSJ8XJ7Y0F1Q2W3E4R5T6Y7U",
    "number": "INV-2025-0042",
    "status": "draft",
    "currency": "USD",
    "customer": { "id": "01JSJ8V9GJHXV0J3Y6K4D2N8QW", "name": "ACME, Inc." },
    "totals": { "amount": "125.00", "taxesTotal": "0", "total": "125.00" }
  }
}
```

## Full Event Reference

- [Rule types](https://openmeter.io/docs/integrations/notifications/rule)
- [Entitlement events](https://openmeter.io/docs/integrations/notifications/entitlements)
- [Invoice events](https://openmeter.io/docs/integrations/notifications/invoices)
- [Event payloads and delivery status](https://openmeter.io/docs/integrations/notifications/event)
