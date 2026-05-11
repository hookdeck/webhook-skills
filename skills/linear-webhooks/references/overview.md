# Linear Webhooks Overview

## What Are Linear Webhooks?

Linear is an issue tracking and project management platform. It uses webhooks to notify your application when entities change inside a workspace — issues, comments, projects, cycles, labels, and more. Instead of polling Linear's GraphQL API, your service receives an HTTP POST whenever something happens.

Webhooks are useful for syncing issues to other tools, posting notifications to chat, mirroring Linear data into a warehouse, or building automation around SLAs and projects.

## Common Event Types

Linear identifies the event type with the `Linear-Event` HTTP header. The most common values are:

| `Linear-Event` | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `Issue` | Issue created/updated/removed | Sync to external trackers, notifications |
| `Comment` | Comment created/updated/removed | Mirror discussions, bot replies |
| `IssueLabel` | Label created/updated/removed | Tag-based routing, analytics |
| `Project` | Project created/updated/removed | Roadmap dashboards, project status sync |
| `ProjectUpdate` | A project update is posted | Status reports, stakeholder digests |
| `Cycle` | Cycle (sprint) created/updated/removed | Sprint dashboards, burndown charts |
| `Reaction` | Reaction added/removed | Engagement analytics |
| `Document` | Document created/updated/removed | Knowledge base sync |
| `Initiative` | Initiative created/updated/removed | Portfolio reporting |
| `InitiativeUpdate` | Initiative update posted | Executive digests |
| `Customer` | Customer record changed | CRM sync |
| `CustomerRequest` | Customer request created/updated | Triage automation |
| `User` | Workspace user changed | Identity sync |
| `IssueSLA` | SLA `set`, `highRisk`, or `breached` | Escalation, paging |
| `OAuthAppRevoked` | OAuth app revoked | Cleanup |

## Action Values

Most data-change events include an `action` field:

- `create` — entity created
- `update` — entity updated (the `updatedFrom` object describes previous values)
- `remove` — entity deleted

`IssueSLA` events use SLA-specific action values (`set`, `highRisk`, `breached`). `OAuthAppRevoked` is fired once when permissions are revoked.

## Event Payload Structure

A typical data-change payload looks like:

```json
{
  "action": "create",
  "type": "Issue",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "data": {
    "id": "issue-uuid",
    "title": "Fix login bug",
    "description": "Steps to reproduce...",
    "priority": 2,
    "state": { "id": "...", "name": "Todo", "type": "unstarted" },
    "team": { "id": "...", "key": "ENG", "name": "Engineering" },
    "creator": { "id": "...", "name": "Alice" }
  },
  "url": "https://linear.app/team/issue/ENG-123",
  "actor": { "id": "user-uuid", "name": "Alice" },
  "webhookId": "webhook-uuid",
  "webhookTimestamp": 1705312800000,
  "organizationId": "org-uuid"
}
```

`update` events also include an `updatedFrom` object with the previous values of the changed fields:

```json
{
  "action": "update",
  "type": "Issue",
  "data": { "id": "issue-uuid", "title": "New title", "priority": 1 },
  "updatedFrom": { "title": "Old title", "priority": 3 },
  "webhookTimestamp": 1705312800000
}
```

## Key Headers

| Header | Description |
|--------|-------------|
| `Linear-Signature` | HMAC-SHA256 signature (hex) of the raw body |
| `Linear-Event` | Entity type (`Issue`, `Comment`, `Project`, …) |
| `Linear-Delivery` | UUID v4 unique to this delivery — use for idempotency |
| `Content-Type` | `application/json; charset=utf-8` |
| `User-Agent` | `Linear-Webhook` |

## Replay Protection

Every Linear webhook payload includes a `webhookTimestamp` field expressed in **milliseconds since epoch**. Linear recommends rejecting any webhook whose timestamp is more than **1 minute** away from your server's clock. This prevents replay of intercepted requests.

## Full Event Reference

For the complete list of events and payload shapes, see the [Linear webhooks documentation](https://linear.app/developers/webhooks).
