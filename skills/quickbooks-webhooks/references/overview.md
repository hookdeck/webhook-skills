# QuickBooks Online Webhooks Overview

## What Are QuickBooks Webhooks?

QuickBooks Online webhooks notify your app when data changes in a QuickBooks Online company (a "realm") that has connected to your app through OAuth 2.0. Intuit sends an HTTPS `POST` with a JSON body to the endpoint URL configured on your app in the Intuit Developer dashboard.

Notifications are **thin**: they say which entity changed, in which company, and how. They don't include the record itself. To get the current data, call the QuickBooks Online Accounting API (e.g. `GET /v3/company/{realmId}/invoice/{id}`) or run a ChangeDataCapture (CDC) query.

Webhooks apply to every company connected to the app. You only receive events for companies that finished the OAuth 2.0 flow, and that includes sandbox companies.

## What Does the QuickBooks Webhook Payload Look Like?

Intuit sends one of two formats. Which one is a **per-app** setting: the **Enable cloud event payload format** toggle on the app's Webhooks page in the Intuit Developer portal. It was off by default on a test app checked in November 2026, and Intuit's warning next to it says that changing the format requires endpoint changes. The signature scheme is the same for both.

| | CloudEvents (toggle on) | Legacy (toggle off) |
|---|---|---|
| `Content-Type` | `application/cloudevents-batch+json; charset=utf-8` | `application/json; charset=utf-8` |
| `intuit-notification-schema-version` | `2.0` | `1.0` |
| Body | JSON **array** of CloudEvents | JSON **object** with `eventNotifications` |
| Event identifier | `type` string, e.g. `qbo.invoice.created.v1` | entity `name` + `operation`, e.g. `Account` + `Create` |
| Extra headers | `intuit-signature-algorithm: HMAC-SHA256`, `intuit-signature-id` | none |

### CloudEvents format

Intuit is moving webhook notifications to the [CloudEvents](https://cloudevents.io/) format, a change it announced in November 2025. The body is a JSON **array** (CloudEvents batch mode), even when it holds a single event. One delivery can hold events for **several companies**, so don't assume one realm per request.

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
| `type` | `namespace.entitytype.eventname.version`, e.g. `qbo.salesreceipt.updated.v1` |
| `datacontenttype` | Content type of `data` (`application/json`). Can be missing. |
| `time` | When the change happened (RFC 3339, UTC). Use it to order events. |
| `intuitentityid` | ID of the entity that changed |
| `intuitaccountid` | QuickBooks Online company ID (realm ID) |
| `data` | Extra details. Its shape depends on the event, and it can be empty or missing. |

How `data` varies by event:

- **Merged**: `qbo.customer.merged.v1` carries `data.deletedid`, the ID of the record merged away.
- **Employee created**: `qbo.employee.created.v1` carries `data.alternative_ids`.
- **Updated**: `qbo.salesreceipt.updated.v1` can have no `data` at all.
- **Test events**: a delivery from the portal's **Send test events** has `data: {}`.

A real CloudEvents test delivery, exactly as Intuit sent it (November 2026):

```json
[{"specversion":"1.0","id":"fb16f042-7faa-4897-b9a2-bed048bc3078","source":"intuit.dsnBgbseACLLRZNxo2dfc4evmEJdxde58xeeYcZliOU=","type":"qbo.invoice.created.v1","datacontenttype":"application/json","time":"2026-11-18T16:10:06.261845232Z","intuitentityid":"1234","intuitaccountid":"310687","data":{}}]
```

### Legacy `eventNotifications` format

Apps with the toggle off still receive a single JSON **object**. A real legacy test delivery (November 2026), pretty-printed:

```json
{
  "eventNotifications": [
    {
      "realmId": "310687",
      "dataChangeEvent": {
        "entities": [
          {
            "id": "1234",
            "operation": "Create",
            "name": "Account",
            "lastUpdated": "2026-11-18T16:08:22.702Z"
          }
        ]
      }
    }
  ]
}
```

There is no type string: identify the event by the entity `name` and `operation` (`Create`, `Update`, `Delete`, `Merge`, `Void`, `Emailed`). The signature scheme is the same for both formats. The examples in this skill accept both and normalize them to `{ entity, action, entityId, realmId }`, mapping legacy operations to the CloudEvents spelling: `Create`→`created`, `Update`→`updated`, `Delete`→`deleted`, `Merge`→`merged`, `Void`→`void`, `Emailed`→`emailed`. Intuit doesn't publish that mapping; it's how the portal's CloudEvents names line up with the legacy entity and operation table. Once your app only receives CloudEvents, you can drop the legacy branch.

## Common Event Types

The event `type` has the format `qbo.<entity>.<operation>.v1`: lowercase, multi-word entities run together (`billpayment`, `purchaseorder`), and the operation is one of `created`, `updated`, `deleted`, `merged`, `void` (not `voided`) or `emailed`. Intuit's documentation prints only four type strings, listed below. The Intuit Developer portal's **Send test events** picker lists 105 names, one for every cell in the table under [Supported Entities and Operations](#supported-entities-and-operations), plus `qbo.changeorder.created.v1`, `qbo.changeorder.updated.v1`, `qbo.changeorder.deleted.v1` and `qbo.currency.deleted.v1`, which the docs' table doesn't include.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `qbo.account.created.v1` | Account created | Add the account to your chart of accounts copy |
| `qbo.customer.merged.v1` | Two customers merged | Re-point references from `data.deletedid` |
| `qbo.salesreceipt.updated.v1` | Sales receipt changed | Update revenue reporting |
| `qbo.employee.created.v1` | Employee created | Provision in HR or payroll tools |

The examples dispatch on the operation segment: `created`, `updated`, `deleted` and `merged` by name, and `void`, `emailed` or anything new through a default branch that re-fetches the record, so they cover every entity.

## Supported Entities and Operations

In CloudEvents names the columns are spelled `created`, `updated`, `deleted`, `merged`, `void` and `emailed`, and the entity is lowercased: Invoice + Void is `qbo.invoice.void.v1`. This is the docs' table; the portal also lists ChangeOrder (created, updated, deleted) and Currency deleted.

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
- [Configure webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/configure-webhooks)
- [Data objects in webhook payloads](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/data-objects)
- [Webhook best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices)
