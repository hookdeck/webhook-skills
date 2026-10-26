# Qlik Cloud Webhooks Overview

## What Are Qlik Cloud Webhooks?

Qlik Cloud (Qlik's SaaS analytics and data integration platform) lets tenant admins, and Qlik
Automate users, create webhooks that call an HTTPS endpoint when system events happen: apps,
reloads, automations, users, API keys and data-integration tasks. Each delivery is a JSON
CloudEvent. The endpoint must use HTTPS and can't be an IP address.

Delivery behavior from the docs: no timeout or retry policy is documented. Delivery history is kept
for 7 days, and an event can be resent by hand from it. Treat deliveries as at-least-once and make
handlers idempotent on the event `id`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `com.qlik.v1.app.created` | An app is created | Catalog sync |
| `com.qlik.v1.app.exported` | An app is exported | Audit trail |
| `com.qlik.v1.app.published` | An app is published | Refresh dependent content |
| `com.qlik.v1.app.deleted` | An app is deleted | Remove from catalog |
| `com.qlik.v1.app.reload.finished` | An app reload finishes | Trigger downstream jobs |
| `com.qlik.v1.app.data.updated` | An app's data is updated | Invalidate caches |
| `com.qlik.v1.reload.finished` | A reload finishes | Alert on `data.succeeded` false |
| `com.qlik.v1.api-key.validation.failed` | An API key fails validation | Security alerts |
| `com.qlik.v1.user.created` | A user is created | Provisioning |
| `com.qlik.v1.user.deleted` | A user is deleted | Deprovisioning |
| `com.qlik.v1.automation.created` | An automation is created | Inventory |
| `com.qlik.v1.automation.updated` | An automation is updated | Change tracking |
| `com.qlik.v1.automation.deleted` | An automation is deleted | Inventory |
| `com.qlik.v1.automation.run.started` | An automation run starts | Run monitoring |

Qlik documents 22 event types (this list shows 14), plus others such as
`com.qlik.analytics.change-store.changes.saved`. The examples handle a few and log the rest.

## Event Payload Structure

```json
{
  "id": "b347fd0d-1321-417f-91ee-90e96c76389c",
  "time": "2018-10-30T07:06:22Z",
  "type": "com.qlik.v1.reload.finished",
  "source": "com.qlik/reloads",
  "specversion": "1.0",
  "datacontenttype": "application/json",
  "tenantid": "UkeLb6ICti8OA8f3LueRI5kVNtuHc15f",
  "userid": "5be59decca62aa00097268a4",
  "data": { "id": "6a849f7f18ec290e6ceb025d", "appId": "002ff8c5-3c11-4464-a22b-68fb5e7ee5e8", "succeeded": true }
}
```

- Dispatch on the top-level `type` (CloudEvents).
- **Legacy format:** events in the Legacy format have been sent since November 3, 2025 as hybrids that
  carry the same value in the legacy `eventType`. The legacy fields are removed on December 10,
  2026, leaving `type` alone. Payloads from before the hybrid period carry only `eventType` and
  nest their data under `data.attributes`. The examples read `type` and fall back to `eventType`.
- Field shapes differ per event, so check types before reading nested fields.

## Full Event Reference

For the complete list, see [Supported event types for webhooks](https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Admin/mc-administer-webhooks.htm) and [qlik.dev's event APIs](https://qlik.dev/apis/event/).
