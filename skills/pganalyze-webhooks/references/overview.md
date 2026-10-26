# pganalyze Webhooks Overview

## What Are pganalyze Webhooks?

[pganalyze](https://pganalyze.com) is Postgres performance monitoring. Webhooks (Early Access, available to a limited number of customers) send Alerts & Check-Up issues as signed HTTP requests to your own endpoints, so you can connect pganalyze to your own services or any tool that accepts webhooks. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the organization's `whsec_` signing secret.

Webhooks fire on issue state changes, for issues of all severities. An issue reaches a webhook through an Alert Destination and an Alert Rule; if several rules route the same issue to one webhook, it receives a single request.

## Event Payload Structure

Every body is `{ type, id, timestamp, version, organization, data }`:

```json
{
  "type": "issue.escalated",
  "id": "6f1c9a8e-2b3d-4e5f-9a1b-2c3d4e5f6a7b",
  "timestamp": "2026-10-14T17:02:11Z",
  "version": 1,
  "organization": { "id": "9a8e6f1c-9a1b-4e5f-2b3d-2c3f6a7bd4e5", "slug": "acme" },
  "data": {
    "endpoint": { "id": "42", "name": "Ops alert router" },
    "issue": {
      "id": "12345",
      "severity": "critical",
      "state": "triggered",
      "checkKind": "queries/slowness",
      "description": "Slow queries on prod-db",
      "queryText": "SELECT 1",
      "details": { "avg_time": 1.5 },
      "createdAt": "2026-10-14T16:40:00Z",
      "updatedAt": "2026-10-14T17:02:10Z",
      "url": "https://app.pganalyze.com/databases/678/checks/queries/slowness/12345",
      "references": [{ "kind": "Query", "name": "…", "queryText": "SELECT …", "url": "https://…" }]
    },
    "server": { "id": "abc123xyz", "name": "prod-db", "url": "https://app.pganalyze.com/servers/abc123xyz", "tags": { "env": "production" } },
    "database": { "id": "678", "name": "app_production" },
    "alertRules": [{ "id": "7", "name": "Prod alerts" }],
    "alertDestinations": [{ "id": "9", "name": "SRE Team" }]
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event type, for example `issue.escalated`. This is what handlers switch on; no header carries it |
| `id` | The event ID. It is also the `webhook-id` header and stays the same across retries, so it is the idempotency key |
| `timestamp` | ISO 8601 time of the event (the `webhook-timestamp` header is the send time in Unix seconds) |
| `version` | Payload version (`1` in the documented example) |
| `organization` | `id` and `slug` of the pganalyze organization |
| `data.endpoint` | The webhook that received this request (`id`, `name`) |
| `data.issue` | The issue: `id`, `severity`, `state`, `checkKind`, `description`, `queryText`, `details`, `createdAt`, `updatedAt`, `url`, `references` |
| `data.server`, `data.database` | Where the issue was found |
| `data.alertRules`, `data.alertDestinations` | The rules and destinations that routed it |

`data.issue.state` carries the issue's state separately from the event `type`. The `data` fields for `ping` are not documented separately: don't rely on `data.issue` being present there.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `issue.triggered` | An issue is created | Open a ticket, page on-call |
| `issue.escalated` | An issue's severity increases | Raise urgency, notify a wider group |
| `issue.downgraded` | An issue's severity decreases | Lower urgency |
| `issue.acknowledged` | An issue is acknowledged | Mark a ticket as being worked on |
| `issue.reopened` | An acknowledged issue is reopened | Reopen a ticket |
| `issue.resolved` | An issue is resolved | Close the ticket, clear the alert |
| `ping` | A webhook is tested | Confirm the endpoint is reachable and verifies signatures |

## Full Event Reference

The 7 events above are the ones documented in the [pganalyze webhooks documentation](https://pganalyze.com/docs/checks/webhooks), which doesn't claim the list is exhaustive, so handlers should ignore types they don't recognise.
