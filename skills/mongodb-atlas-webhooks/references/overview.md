# MongoDB Atlas Webhooks Overview

## What Are MongoDB Atlas Webhooks?

Atlas can POST an alert to your URL whenever an alert opens, updates, or closes. You configure this as a project integration (Project Settings → Integrations → Webhook Settings) and then add **Webhook** as a notification method on an alert. Atlas Triggers and App Functions are a different product and are not covered here.

## Common Event Types

The body's `eventTypeName` says what happened. The official page documents these:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `OUTSIDE_METRIC_THRESHOLD` | A metric (named in `metricName`) is outside its threshold; `currentValue` holds the reading | Disk, CPU, connections alerts; paging, autoscaling |
| `HOST_DOWN` | A host is down | On-call notification, failover checks |

The full set of `eventTypeName` values is in the Atlas Administration API alerts documentation ("Get All Project Alerts"). Handle unknown values gracefully.

`status` is `OPEN` while the condition holds and `CLOSED` once resolved (the docs give these as examples).

## Request Headers

| Header | Description |
|--------|-------------|
| `X-MMS-Event` | Alert state: `alert.open`, `alert.close`, `alert.update`, `alert.acknowledge`, `alert.cancel`, `alert.inform` |
| `X-MMS-Signature` | Optional. Base64 HMAC-SHA1 of the raw body, present only when a Webhook Secret is set |

## Event Payload Structure

The body uses the same format as the Administration API Alerts resource:

```json
{
  "id": "5d1b6f8e8c2e4e2d3c4a5b6c",
  "groupId": "5d1b6f8e8c2e4e2d3c4a5b6d",
  "eventTypeName": "OUTSIDE_METRIC_THRESHOLD",
  "status": "OPEN",
  "created": "2024-01-15T10:30:00Z",
  "updated": "2024-01-15T10:30:00Z",
  "lastNotified": "2024-01-15T10:30:00Z",
  "humanReadable": "Disk space used on data partition is 95.2%. Project: MyProject Organization: MyOrganization",
  "metricName": "DISK_PARTITION_SPACE_USED_DATA",
  "currentValue": { "number": 95.2, "units": "RAW" }
}
```

Other documented fields: `severity` (set when the alert opens). You can customize headers and body with FreeMarker templates in Webhook Settings; a custom body template changes the payload shape.

## Delivery

Return any **2xx** status; Atlas treats other codes as failures. Delivery errors show in the Atlas **Activity Feed**. Make handlers idempotent: key on the alert `id` plus `status`/`updated`.

## Full Event Reference

See [MongoDB Atlas webhook integration](https://www.mongodb.com/docs/atlas/tutorial/webhook-integration/).
