# FireHydrant Webhooks Overview

## What Are FireHydrant Webhooks?

FireHydrant lets you create webhooks (Settings → Webhooks) that send an HTTP `POST` with a
JSON body to one destination URL when internal events occur. Each webhook has a URL, a
Secret, an Active/Inactive status, and event subscriptions. The Secret is used to sign
every request in the `fh-signature` header.

## Event Subscriptions

| Subscription | Fires When |
|--------------|------------|
| Change Events | A new Change Event is created in FireHydrant |
| Incidents | Any change on a public incident |
| Incidents (Private) | Any change on a private incident |
| Signals (BETA) | Any Signals/alert activity, including alert state changes |

A webhook used only for Command Extensions can leave all subscriptions unchecked.

## Common Event Types

FireHydrant has no single event-name string. Every payload has top-level `data` and
`event` keys, and `event` holds `operation` and `resource_type`.

| `event.resource_type` | `event.operation` | Triggered When | Common Use Cases |
|-----------------------|-------------------|----------------|------------------|
| `incident` | `UPDATED` | Chat messages, follow-up updates, field changes (including custom fields), milestone and milestone-timestamp changes, notes and impacted infrastructure, role assignments, task updates, team assignments | Sync to ticketing, post status updates, audit trails |
| `change_event` | `updated` | A change event is created or updated | Deploy tracking, correlating changes with incidents |
| `signals_alerts` | `CREATED` | A Signals alert is created | Forward alerts to chat or other tools |
| `signals_alerts` | `UPDATED` | An alert is acknowledged, escalated, resolved, dismissed or times out | Track alert lifecycle |

Operation casing is not consistent in the documentation (`UPDATED` for incidents,
`updated` for change events), so compare case-insensitively.

## Event Payload Structure

### Incident

```json
{
  "data": {
    "incident": {
      "id": "04d9fd1a-ba9c-417d-b396-58a6e2c374de",
      "number": 602,
      "name": "Hark I hear an incident subscription webhook",
      "current_milestone": "resolved",
      "severity": { "slug": "SEV2" },
      "priority": { "slug": "P3" }
    }
  },
  "event": { "operation": "UPDATED", "resource_type": "incident" }
}
```

### Change event

`data` is the change event itself (`id`, `summary`, `description`, `starts_at`, `ends_at`,
`environments`, `services`, `labels`, ...).

```json
{
  "data": { "id": "489d7b90-a9d7-43d2-99be-d33c5acb59f8", "summary": "Production Deploy " },
  "event": { "operation": "updated", "resource_type": "change_event" }
}
```

### Signals alert (BETA)

```json
{
  "data": {
    "alert": {
      "id": "6f767579-0015-400e-8c6e-cb481d5760c2",
      "summary": "This is the Summary/Title of the Alert",
      "status": "opened",
      "decision": null
    }
  },
  "event": { "operation": "CREATED", "resource_type": "signals_alerts" }
}
```

`data.alert.decision` is `null` on creation, then `ACKNOWLEDGE`, `ESCALATE`, `RESOLVE`,
`DISMISS` or `TIMEOUT`. `data.alert.status` is `opened`, `acknowledged`, `resolved` or `ignored`.
`event.operation` is `CREATED` when the alert is created and `UPDATED` for everything else.

## Full Event Reference

See [FireHydrant's webhook documentation](https://docs.firehydrant.com/docs/webhooks).
