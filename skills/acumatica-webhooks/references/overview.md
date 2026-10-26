# Acumatica Webhooks Overview

## What Are Acumatica Webhooks?

Acumatica (MYOB Acumatica) ERP can send **push notifications** in real time when data changes.
On the Push Notifications form (SM302000) you pick a destination type; **Webhook** means an HTTP
address that receives an HTTP POST with a JSON body. A notification is produced when the results
of a monitored **generic inquiry** (or a built-in query definition class) change. Requests are
not signed. Optionally you add one custom header (name and value) to the destination, and the
receiver checks it.

## Change Types

There is no event-type field in the payload. A notification describes changed rows:

| Change | Triggered When | Where it appears | Common Use Cases |
|--------|----------------|------------------|------------------|
| Row inserted | A row is new in the inquiry results | `Inserted` only | Create the record downstream |
| Row deleted | A row is gone from the inquiry results | `Deleted` only | Remove or archive the record |
| Row updated | A tracked field of a row changed | `Deleted` (old values) and `Inserted` (new values) | Sync the changed fields |

The `Query` field names the generic inquiry (for example `Stock Items: Last Modified Date`), so
route on `Query` first, then on the shape of `Inserted`/`Deleted`.

## Event Payload Structure

```json
{
  "Inserted": [
    { "InventoryID": "AACOMPUT01", "StockItem": true, "ItemStatus": "Inactive",
      "InventoryItem_lastModifiedDateTime": "2024-05-05T15:16:23.1" }
  ],
  "Deleted": [
    { "InventoryID": "AACOMPUT01", "StockItem": true, "ItemStatus": "Active",
      "InventoryItem_lastModifiedDateTime": "2024-05-05T15:16:23.103" }
  ],
  "Query": "Stock Items: Last Modified Date",
  "CompanyId": "MyTenant",
  "Id": "1af4d140-5321-41f2-a2ec-50b67f577c6c",
  "TimeStamp": 636295833829493672,
  "AdditionalInfo": {}
}
```

| Field | Description |
|-------|-------------|
| `Inserted` | Rows new in the query results. Row keys are the inquiry's columns. |
| `Deleted` | Rows that were in the results but are missing after the latest transaction. |
| `Query` | Name of the generic inquiry or built-in definition class. |
| `CompanyId` | Tenant name. |
| `Id` | Unique id of the data transaction. Use it to omit duplicate notifications. |
| `TimeStamp` | Long value for the transaction time; use it to order notifications. |
| `AdditionalInfo` | Additional system or custom information. |

If you track specific fields, attributes that did not change come back as `null` in the rows. If
a multilingual field changes, the same value can appear in both `Inserted` and `Deleted`.

## Delivery

Acumatica makes at most five attempts to send a notification. If your endpoint replies with an
error, it is resent, which can cause duplicates. Reply `200` once the notification is received.
Failed notifications show on the Process Push Notifications (SM502000) form and can be resent for
two days.

## Full Reference

- [Push Notifications: Destinations](https://help.myob.com.au/advanced/Docs/Published/IntegrationDevelopmentGuide/IntegrationDev_PushNotifications_Destinations.html)
- [Push Notifications: Format](https://help.myob.com.au/advanced/Docs/Published/IntegrationDevelopmentGuide/IntegrationDev_PushNotifications_Format.html)
- [Push Notifications form (SM302000)](https://help.myob.com.au/advanced/Docs/Published/UserGuide/SM_30_20_00.html)
