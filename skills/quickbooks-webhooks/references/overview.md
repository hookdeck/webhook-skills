# QuickBooks Online Webhooks Overview

## What Are QuickBooks Webhooks?

QuickBooks Online webhooks notify your app when data changes in a QuickBooks Online company (a "realm") that has connected to your app through OAuth 2.0. Intuit sends an HTTPS `POST` with a JSON body to the endpoint URL configured on your app in the Intuit Developer dashboard.

Notifications are **thin**: they say which entity changed, in which company, and how. They don't include the record itself. To get the current data, call the QuickBooks Online Accounting API (e.g. `GET /v3/company/{realmId}/invoice/{id}`) or run a ChangeDataCapture (CDC) query.

Webhooks apply to every company connected to the app. You only receive events for companies that finished the OAuth 2.0 flow, and that includes sandbox companies.

## What Does the QuickBooks Webhook Payload Look Like?

### CloudEvents format (current)

In 2026 Intuit moved webhook notifications to the [CloudEvents](https://cloudevents.io/) format. The body is a JSON **array**. One delivery can hold events for **several companies**, so don't assume one realm per request.

```json
[
  {
    "specversion": "1.0",
    "id": "88cd52aa-33b6-4351-9aa4-47572edbd068",
    "source": "intuit.dsnBgbseACLLRZNxo2dfc4evmEJdxde58xeeYcZliOU=",
    "type": "qbo.account.created.v1",
    "datacontenttype": "application/json",
    "time": "2025-09-10T21:31:25.179851517Z",
    "intuitentityid": "1234",
    "intuitaccountid": "310687",
    "data": {}
  }
]
```

| Field | Description |
|-------|-------------|
| `specversion` | CloudEvents spec version. Can be ignored. |
| `id` | Unique event ID. Use it for deduplication and troubleshooting. |
| `source` | GUID value. Can be ignored. |
| `type` | `namespace.entitytype.eventname.version`, e.g. `qbo.invoice.updated.v1` |
| `datacontenttype` | Content type of `data` (`application/json`). Can be missing. |
| `time` | When the change happened (RFC 3339, UTC). Use it to order events. |
| `intuitentityid` | ID of the entity that changed |
| `intuitaccountid` | QuickBooks Online company ID (realm ID) |
| `data` | Extra details. Its shape depends on the event, and it can be empty or missing. |

How `data` varies by event:

- **Merged**: `qbo.customer.merged.v1` carries `data.deletedid`, the ID of the record merged away.
- **Employee created**: `qbo.employee.created.v1` carries `data.alternative_ids`.
- **Updated**: `qbo.salesreceipt.updated.v1` can have no `data` at all.

### Legacy `eventNotifications` format

Apps built before the migration received a single JSON **object**:

```json
{
  "eventNotifications": [
    {
      "realmId": "310687",
      "dataChangeEvent": {
        "entities": [
          {
            "name": "Customer",
            "id": "1",
            "operation": "Create",
            "lastUpdated": "2025-10-05T14:42:19-0700"
          }
        ]
      }
    }
  ]
}
```

The signature scheme is the same for both. The examples in this skill accept both and normalize them to `{ entity, action, entityId, realmId }`. Legacy operations map as `Create`→`created`, `Update`→`updated`, `Delete`→`deleted`, `Merge`→`merged`, `Void`→`voided`, `Emailed`→`emailed`. Once your app only receives CloudEvents, you can drop the legacy branch.

## Common Event Types

The event `type` is `qbo.{entity in lowercase}.{event}.v1`. Intuit's documentation shows `qbo.account.created.v1`, `qbo.customer.merged.v1`, `qbo.employee.created.v1` and `qbo.salesreceipt.updated.v1`. Other entities and operations follow the same pattern.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `qbo.invoice.created.v1` | Invoice created | Sync invoice to CRM or billing system |
| `qbo.invoice.updated.v1` | Invoice changed (including status changes) | Refresh balance and status |
| `qbo.payment.created.v1` | Customer payment recorded | Mark orders paid, reconcile |
| `qbo.customer.created.v1` | Customer created | Create matching CRM contact |
| `qbo.customer.updated.v1` | Customer changed | Keep contact details in sync |
| `qbo.customer.merged.v1` | Two customers merged | Re-point references from `data.deletedid` |
| `qbo.salesreceipt.updated.v1` | Sales receipt changed | Update revenue reporting |
| `qbo.employee.created.v1` | Employee created | Provision in HR or payroll tools |

The examples dispatch on the event segment (`created`, `updated`, `deleted`, `merged`, `voided`, `emailed`), so they cover every entity.

## Supported Entities and Operations

| Entity | Create | Update | Delete | Merge | Void | Emailed |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|
| Account | ✓ | ✓ | ✓ | ✓ | | |
| Bill | ✓ | ✓ | ✓ | | | |
| BillPayment | ✓ | ✓ | ✓ | | ✓ | |
| Budget | ✓ | ✓ | | | | |
| Class | ✓ | ✓ | ✓ | ✓ | | |
| CreditMemo | ✓ | ✓ | ✓ | | ✓ | ✓ |
| Currency | ✓ | ✓ | | | | |
| Customer | ✓ | ✓ | ✓ | ✓ | | |
| Department | ✓ | ✓ | | ✓ | | |
| Deposit | ✓ | ✓ | ✓ | | | |
| Employee | ✓ | ✓ | ✓ | ✓ | | |
| Estimate | ✓ | ✓ | ✓ | | | ✓ |
| Invoice | ✓ | ✓ | ✓ | | ✓ | ✓ |
| Item | ✓ | ✓ | ✓ | ✓ | | |
| JournalCode | ✓ | ✓ | | | | |
| JournalEntry | ✓ | ✓ | ✓ | | | |
| Payment | ✓ | ✓ | ✓ | | ✓ | ✓ |
| PaymentMethod | ✓ | ✓ | | ✓ | | |
| Preferences | | ✓ | | | | |
| Purchase | ✓ | ✓ | ✓ | | ✓ | |
| PurchaseOrder | ✓ | ✓ | ✓ | | | ✓ |
| RefundReceipt | ✓ | ✓ | ✓ | | ✓ | ✓ |
| SalesReceipt | ✓ | ✓ | ✓ | | ✓ | ✓ |
| TaxAgency | ✓ | ✓ | | | | |
| Term | ✓ | ✓ | | | | |
| TimeActivity | ✓ | ✓ | ✓ | | | |
| Transfer | ✓ | ✓ | ✓ | | ✓ | |
| Vendor | ✓ | ✓ | ✓ | ✓ | | |
| VendorCredit | ✓ | ✓ | ✓ | | | |

## Delivery Behavior

- **Respond within 3 seconds** with HTTP 200. Do the work asynchronously from a queue.
- **Retries**: 10s, 20s, 30s, 5m, 20m, 2h, 4h, 6h, then every 6 hours. Later events can be held back until the failed one is acknowledged.
- **Ordering**: events can arrive out of order. Treat `time` (or `lastUpdated` in the legacy format) as the source of truth.
- **Reliability**: Intuit recommends a ChangeDataCapture (CDC) call to recover missed events, and a daily CDC sweep.
- **Size**: Intuit sets no limit on payload size or event count. Make sure your server's body-size limit (often 2 MB by default) is high enough.

## Full Event Reference

- [QuickBooks Online webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks)
- [Managing webhook notifications](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/managing-webhooks-notifications)
- [Data objects in webhook payloads](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/data-objects)
- [Webhook best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices)
