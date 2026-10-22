# Opsgenie Webhooks Overview

## What Are Opsgenie Webhooks?

Opsgenie's Webhook integration posts a JSON payload to a URL you choose whenever an alert action
happens. The URL can be any web server reachable from the internet. The payload carries the
alert activity plus a subset of the alert fields (alert ID, username, alias, entity, user ID).
You can add custom headers to the call; Opsgenie does not sign requests, so a secret custom
header is how you authenticate them.

Opsgenie is end-of-sale and Atlassian support ends in April 2027, with customers moving to Jira
Service Management and Compass.

## Common Alert Actions

The payload's `action` field holds the action name (case-sensitive, exactly as below).

| Action | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `Create` | An alert is created | Open a ticket, post to chat |
| `Acknowledge` | An alert is acknowledged | Mark a ticket in progress |
| `UnAcknowledge` | An acknowledgement is removed | Reopen a ticket |
| `AddNote` | A note is added to an alert | Sync comments |
| `AddTags` | Tags are added | Sync labels |
| `RemoveTags` | Tags are removed | Sync labels |
| `Close` | An alert is closed | Resolve a ticket |
| `AssignOwnership` | An owner is assigned | Assign a ticket |
| `TakeOwnership` | A user takes ownership | Assign a ticket |
| `Delete` | An alert is deleted | Archive a ticket |
| `Escalate` | An alert is escalated | Notify the escalation target |
| `UpdatePriority` | The priority changes | Sync severity |
| `UpdateDescription` | The description changes | Sync text |
| `UpdateMessage` | The message changes | Sync title |
| `AddTeam` | A team is added | Notify the team |
| `AddRecipient` | A recipient is added | Notify the recipient |

A **custom action** executed on an alert sends its own name as `action` (for example
`TestAction`), so handle unknown names gracefully.

## Event Payload Structure

```json
{
  "source": { "name": "web", "type": "API" },
  "alert": {
    "alertId": "052652ac-5d1c-464a-812a-7dd18bbfba8c",
    "tinyId": "23",
    "alias": "aliastest",
    "message": "test alert",
    "username": "fili@ifountain.com",
    "userId": "daed1180-0ce8-438b-8f8e-57e1a5920a2d",
    "source": "fili@ifountain.com",
    "entity": "",
    "tags": ["tag1", "tag2"],
    "createdAt": 1420452191104,
    "updatedAt": 1420452193166002000
  },
  "action": "Create",
  "integrationId": "37c8f316-17c6-49d7-899b-9c7e540c048d",
  "integrationName": "Integration1"
}
```

- `Create` also includes `alert.teams` and `alert.recipients` (IDs).
- Action-specific fields appear on `alert`: `note`, `addedTags`, `removedTags`, `owner`, `team`,
  `recipient`, `priority`/`oldPriority`, `description`.
- `Escalate` is shaped differently: `alert` holds only `alertId`, and the top level has
  `escalationId`, `escalationName`, `escalationNotify` (`name`, `id`, `type`, `entity`),
  `escalationTime` and `repeatCount`. It has no `source` object.
- `UpdatePriority`, `UpdateDescription` and `UpdateMessage` also include `integrationType`.
- Alert `description` and `details` can be added to `Create` and custom actions only, and are
  truncated to 1000 characters.
- `createdAt` is milliseconds; `updatedAt` is in nanoseconds in the documented samples.

## Full Event Reference

For the full list, see the Opsgenie documentation:
[Integrate Opsgenie with Webhook](https://support.atlassian.com/opsgenie/docs/integrate-opsgenie-with-webhook/)
and [alert action data](https://support.atlassian.com/opsgenie/docs/opsgenie-edge-connector-alert-action-data/).
