# Axiom Webhooks Overview

## What Are Axiom Webhooks?

Axiom monitors watch your data and notify you through notifiers. A **Custom webhook notifier**
sends a `POST` with `Content-Type: application/json` to a URL you choose, together with any
headers you specify, when a monitor fires or resolves. Requests are not signed. Authenticate them
with a secret header you add to the notifier.

> Use the Custom webhook notifier with a secret header. The plain Webhook notifier cannot send one.

## Notification Types

Axiom sends no event-type field. The default template carries the state in `action`:

| `action` | Triggered When | Common Use Cases |
|----------|----------------|------------------|
| `Open` | A match monitor matches, or a threshold monitor triggers | Page on-call, open an incident |
| `Closed` | A threshold monitor resolves | Resolve the incident |

## Payload Structure

The body is a Go template you write, so its shape is yours. The default template is:

```json
{
  "action": "{{.Action}}",
  "event": {
    "monitorID": "{{.MonitorID}}",
    "body": "{{.Body}}",
    "description": "{{.Description}}",
    "queryEndTime": "{{.QueryEndTime}}",
    "queryStartTime": "{{.QueryStartTime}}",
    "timestamp": "{{.Timestamp}}",
    "title": "{{.Title}}",
    "value": {{.Value}},
    "matchedEvent": {{jsonObject .MatchedEvent}},
    "groupKeys": {{jsonArray .GroupKeys}},
    "groupValues": {{jsonArray .GroupValues}}
  }
}
```

Template variables: `.Action` (`Open` or `Closed`), `.MonitorID`, `.Body`, `.Description`,
`.QueryEndTime`, `.QueryStartTime`, `.Timestamp`, `.Title`, `.Value` (threshold monitors only),
`.MatchedEvent` (match monitors only), `.GroupKeys` and `.GroupValues` (grouped queries only).

Illustrative rendered payload (a threshold monitor triggering; the values are examples):

```json
{
  "action": "Open",
  "event": {
    "monitorID": "CabI3w142069etTgd0",
    "body": "Current value of 57347 is above or equal to the threshold value of 0",
    "description": "",
    "queryEndTime": "2024-06-28 14:55:57.631364493 +0000 UTC",
    "queryStartTime": "2024-06-28 14:45:57.631364493 +0000 UTC",
    "timestamp": "2024-06-28 14:55:57 +0000 UTC",
    "title": "Axiom Monitor Test Triggered",
    "value": 57347,
    "matchedEvent": null,
    "groupKeys": null,
    "groupValues": null
  }
}
```

## Full Reference

See [Axiom's Custom webhook notifier documentation](https://axiom.co/docs/monitor-data/custom-webhook-notifier).
