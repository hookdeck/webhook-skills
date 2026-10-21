# MaintainX Webhooks Overview

## What Are MaintainX Webhooks?

MaintainX sends an HTTP `POST` to the endpoint you configure whenever a subscribed event occurs in your account, so your application doesn't have to poll the API. Each subscription targets one event type and one URL. Requests time out after 10 seconds, and webhooks that fail for long periods may be deleted (MaintainX emails the user who created them).

## Common Event Types

The event name is the `eventType` field in the JSON body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `NEW_WORK_ORDER` | A work order is created | Sync to ticketing or ERP, notify dispatch |
| `WORK_ORDER_CHANGE` | Work order properties, assignees, or teams change | Keep external records current |
| `WORK_ORDER_STATUS_CHANGE` | Status changes between `OPEN`, `IN_PROGRESS`, `ON_HOLD`, `DONE` | Trigger billing, close linked tickets |
| `NEW_WORK_REQUEST` | A work request is submitted | Triage and approval workflows |
| `ASSET_STATUS_CHANGE` | Asset status changes (`ONLINE`, `OFFLINE`, custom status) | Downtime alerts, dashboards |

Other available types include `WORK_ORDER_DELETE`, `WORK_ORDER_OVERDUE`, `WORK_ORDER_PART_STATUS_CHANGE`, `NEW_COMMENT_ON_WORK_ORDER`, `NEW_CATEGORY_ON_WORK_ORDER`, `WORK_REQUEST_STATUS_CHANGE`, `NEW_ASSET`, `ASSET_CHANGE`, `NEW_LOCATION`, `LOCATION_CHANGE`, `NEW_PART`, `PART_CHANGE`, `PART_DELETE`, `PART_QUANTITY_CHANGE`, `PART_TRANSFER`, `NEW_PURCHASE_ORDER`, `PURCHASE_ORDER_CHANGE`, `PURCHASE_ORDER_STATUS_CHANGE`, `METER_TRIGGER_STATE_CHANGE`, `NEW_CUSTOMER`, `CUSTOMER_CHANGE`, `NEW_VENDOR`, and user, role, and API-token audit events.

## Event Payload Structure

Common fields (names are camelCase):

```json
{
  "eventType": "WORK_ORDER_STATUS_CHANGE",
  "workOrderId": 123456,
  "orgId": 321,
  "occurredAt": "2022-01-01T00:00:00.000Z",
  "oldStatus": "OPEN",
  "newStatus": "IN_PROGRESS",
  "userId": 789
}
```

- `workOrderId` / `workRequestId` / `assetId`: global ID of the entity (depends on event)
- `orgId`: your organization ID
- `occurredAt`: when the event happened
- `userId`: the user who triggered it; absent for system-initiated events
- `ASSET_STATUS_CHANGE` carries `oldStatus` and `newStatus` as objects, not strings

Subscriptions created through the API can set `options.serializeEntity` on some types to include the full entity.

## Full Event Reference

See [MaintainX's webhook documentation](https://help.getmaintainx.com/build/webhooks) and the "Subscriptions & Webhooks" section of the [REST API reference](https://api.getmaintainx.com/v1/docs).
