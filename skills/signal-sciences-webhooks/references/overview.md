# Signal Sciences Webhooks Overview

## What Are Signal Sciences Webhooks?

Signal Sciences is now the Fastly Next-Gen WAF. The generic webhook integration (alert) sends an HTTP POST with a JSON body to a URL you choose whenever selected activity occurs in a workspace (site). You can subscribe to all activity or to specific activity types.

## Common Event Types

The event name is the `type` field of the JSON body. The activity types available in the Next-Gen WAF control panel are:

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `flag` | An IP address was flagged | Alert on attacker IPs, feed a blocklist |
| `expireFlag` | An IP address flag was manually expired | Keep external blocklists in sync |
| `agentAlert` | An agent alert was triggered | Page on-call for agent problems |
| `siteDisplayNameChanged` | Workspace display name changed | Audit trail |
| `siteNameChanged` | Workspace short name changed | Audit trail |
| `loggingModeChanged` | Agent mode (Blocking, Not Blocking, Off) changed | Alert when protection is turned off |
| `agentAnonModeChanged` | Agent IP anonymization mode changed | Audit trail |
| `createCustomRedaction` / `updateCustomRedaction` / `removeCustomRedaction` | Custom redaction created, updated, removed | Audit trail |
| `customTagCreated` / `customTagUpdated` / `customTagDeleted` | Custom signal created, updated, removed | Audit trail |
| `customAlertCreated` / `customAlertUpdated` / `customAlertDeleted` | Custom alert created, updated, removed | Audit trail |
| `detectionCreated` / `detectionUpdated` / `detectionDeleted` | Templated rule created, updated, removed | Audit trail |
| `listCreated` / `listUpdated` / `listDeleted` | List created, updated, removed | Audit trail |
| `ruleCreated` / `ruleUpdated` / `ruleDeleted` | Request rule created, updated, deleted | Change tracking |
| `customDashboardCreated` / `customDashboardUpdated` / `customDashboardReset` / `customDashboardDeleted` | Custom dashboard changed | Audit trail |
| `customDashboardWidgetCreated` / `customDashboardWidgetUpdated` / `customDashboardWidgetDeleted` | Dashboard card changed | Audit trail |

Fastly notes that the full activity-type list applies to customers with access to the Next-Gen WAF control panel.

## Event Payload Structure

```json
{
  "created": "2024-02-09T21:08:21.31644377Z",
  "type": "flag",
  "payload": {
    "ID": "abcde123456789",
    "CorpID": "123456789abcde",
    "SiteID": "987654321fedcba",
    "Scope": "site",
    "Slug": "site.example",
    "Name": "example",
    "Description": "Webhook integration for Example site",
    "CreatedBy": "admin@example.com",
    "CreatedByID": "edcba987654321",
    "Created": "2024-02-09T21:08:21.31644377Z",
    "Updated": "2025-01-07T21:06:31.50725289Z",
    "ResourceID": "ASDFghjkl123456789"
  },
  "link": "dashboard link to event",
  "workspaceId": "www.mysite.com"
}
```

The shape of `payload` varies by activity type; Fastly's docs link each type to the matching Next-Gen WAF API object. There is no delivery-ID header, so build an idempotency key from fields such as `type`, `created`, and `payload.ID`.

## Full Event Reference

See [Fastly's generic webhooks documentation](https://docs.fastly.com/en/ngwaf/generic-webhooks).
