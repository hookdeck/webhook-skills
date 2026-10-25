# Ampersand Webhooks Overview

## What Are Ampersand Webhooks?

Ampersand is a deep-integration platform for SaaS builders. A **webhook destination** is an HTTPS
endpoint you register in Ampersand. Ampersand posts two kinds of JSON messages to it, delivered through
Svix (signed with the `svix-id`, `svix-timestamp` and `svix-signature` headers):

1. **Notifications**: lifecycle events about installations, connections, reads, writes, subscriptions
   and destinations. Shape: `{ "notificationType": "<type>", "data": {...} }`.
2. **Read / subscribe results**: the data itself, sent when a read action or subscribe action produces
   records. They have no `notificationType`.

The maximum payload is 300 KB. Ampersand sends at most 1000 webhook messages per second across all
destinations by default.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `installation.created` | A customer installs the integration | Provision the customer, start syncing |
| `installation.updated` | The customer changes the configuration (data includes `config` and `lastConfig`) | Re-sync field mappings |
| `installation.deleted` | The customer uninstalls | Clean up customer data |
| `connection.created` | A new OAuth connection is established | Mark the customer connected |
| `connection.refreshed` | The OAuth access token was refreshed automatically | Audit logging |
| `connection.updated` | The user re-authenticated or credentials/metadata changed | Clear a "reconnect" banner |
| `connection.deleted` | A connection is deleted | Mark the customer disconnected |
| `connection.error` | Authentication or token refresh failed (`data.errors`) | Ask the customer to reconnect |
| `read.backfill.done` | Historical sync finished | Start processing backfilled data |
| `read.backfill.error` | Historical sync failed | Alert and retry |
| `read.schedule.paused` | A scheduled sync was paused, often for auth issues | Alert the customer |
| `read.triggered.done` | An on-demand read completed | Continue a workflow |
| `read.triggered.error` | An on-demand read failed | Alert and retry |
| `write.async.done` | An asynchronous write finished (success or failure per record) | Reconcile written records |
| `subscribe.create.success` / `subscribe.update.success` / `subscribe.delete.success` | A subscribe action became active, was updated or was removed | Track subscription state |
| `subscribe.create.error` / `subscribe.update.error` / `subscribe.delete.error` | A subscribe action could not be created, updated or torn down | Alert; delete errors may leave a live subscription at the provider |
| `destination.webhook.disabled` | Your webhook destination was disabled, e.g. after repeated failed deliveries | Fix the endpoint and re-enable it |
| `destination.delivery.error` | Delivery to a destination failed after all retries | Alert and backfill |

## Event Payload Structure

Notification:

```json
{
  "notificationType": "read.backfill.done",
  "data": {
    "projectId": "8f4a2b1c-...",
    "provider": "salesforce",
    "integrationId": "7c9e6679-...",
    "installationId": "a3bb189e-...",
    "connectionId": "c4e7f2a1-...",
    "groupRef": "customer-group-ref",
    "consumerRef": "user-123",
    "objectName": "Account"
  }
}
```

Read result (subscribe results are the same with `"action": "subscribe"` and, per record,
`subscribeEventType`, `providerEventType` and `rawEvent`):

```json
{
  "action": "read",
  "groupRef": "xyz-company",
  "installationId": "installation-id",
  "objectName": "Contact",
  "provider": "salesforce",
  "readType": "scheduled",
  "resultInfo": { "type": "inline", "numRecords": 2 },
  "result": [{ "fields": { "id": "001" }, "mappedFields": {}, "raw": { "id": "001" } }]
}
```

`readType` is `backfill`, `scheduled` or `triggered`. When a single record is over 300 KB,
`resultInfo.type` is `url` and `resultInfo.downloadUrl` (expires after 15 minutes) replaces `result`.

## Full Event Reference

See [Ampersand's webhook documentation](https://docs.ampersand.ai/destinations/webhooks) and the
[notification payloads](https://docs.ampersand.ai/notifications/notification-payloads).
