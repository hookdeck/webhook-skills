# Descope Webhooks Overview

## What Are Descope Webhooks?

Descope's **Audit Webhook connector** streams your project's audit log to an HTTP endpoint you control. Descope persists audit events first, then a background loop collects pending events and POSTs them in batches.

Key behavior:

- The body is a **JSON array** of up to 100 events, even when it holds a single event.
- Delivery is **not real time**. A gap of several minutes is normal, and longer under backlog or retry. Don't drive synchronous user flows from it.
- Requests come from Descope's static IPs, which you can allowlist.
- Any `2xx` response counts as delivered and the events are not resent. Reconcile critical data with the Search Audit API.
- Flow HTTP connectors (generic HTTP calls inside flows) are a different feature and are not covered here.

## Common Event Types

The event type is the `action` field. Values are matched exactly; `Change Password` contains a space.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `LoginSucceed` | A user logs in | Activity feeds, last-login sync |
| `LoginFailed` | A login attempt fails (`data.error_message`) | Security alerting |
| `UserCreated` | A user is created | Provision records in your app or CRM |
| `UserModified` | A user is modified (`data.Change`) | Sync profile, role, or tenant changes |
| `UserDeleted` | A user is deleted | Deprovision data |
| `Change Password` | A password is changed | Notify the user, audit trail |
| `FlowUpdated` | An authentication flow is modified | Change monitoring |
| `ProjectSettings` | Project settings are modified | Compliance monitoring |

## Event Payload Structure

```json
[
  {
    "action": "Change Password",
    "actorId": "U3Dga0ziehqoVAyXog2H6AaknVFn",
    "userId": "U3Dga0ziehqoVAyXog2H6AaknVFn",
    "projectId": "P2ABc0defGHijKLmnOPqrSTuvWXyz",
    "occurred": 1780949905843,
    "occurred_formatted": "2026-06-08T20:18:25.843277Z",
    "method": "",
    "device": "Desktop",
    "geo": "US",
    "loginIds": ["user@company.com"],
    "remoteAddress": "203.0.113.42",
    "tenants": null,
    "data": { "browser": "Chrome", "flow_id": "reset-password", "request_details": { "uri": "/v1/flow/next", "method": "POST" } }
  }
]
```

- `occurred` is a **number** (epoch ms); `occurred_formatted` is the RFC 3339 string.
- The login identifier key is `loginIds` (the Search Audit API calls it `externalIds`).
- There is no event ID or severity field.
- Client context (`browser`, `os`, `correlation_id`, `flow_id`, ...) is nested in `data`, which varies by action.

## Full Event Reference

See [Descope audit events](https://docs.descope.com/audit-trails-and-integrations/audit-events) and the [Audit Webhook connector](https://docs.descope.com/connectors/connector-configuration-guides/network/audit-webhook).
