# Paragon Webhook Destinations Overview

## What Are Paragon Webhooks?

Paragon's Monitoring settings let you send notifications about your project to other services
through **Event Destinations**. A **Webhook Destination** sends a `POST` request with a JSON body
to your URL when an event occurs. Request headers and body contents are configurable. Webhook
Destinations are available on paid plans.

Paragon does not sign these requests. You authenticate them with a secret header you add to the
destination. Managed Sync webhooks are separate, have no auth option, and are not covered here.

## Common Event Types

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `workflow_failure` | An error at any point in a workflow leaves it in the Failed status | Alert the team, open a ticket, link to the execution |
| `credentials_failure` | An OAuth refresh fails and can't be retried; the credential is marked invalid | Prompt the user to reconnect the integration in the Connect Portal |

More events are planned by Paragon; unknown `type` values should be acknowledged with `200`.

## Event Payload Structure

Common fields: `type`, `timestamp` (ms), `timestampISO`, `message`, `user` (`id`, `metadata`),
`project` (`id`, `name`), `integration` (`id`, `type`, e.g. `slack`).

`workflow_failure` adds `workflow` (`id`, `name`) and a `data` object:

```json
{
  "type": "workflow_failure",
  "timestamp": 1729629642607,
  "timestampISO": "2024-10-22T20:40:42.607Z",
  "message": "Workflow “Test Workflow Name“ failed for User <User ID>",
  "user": { "id": "<User ID>", "metadata": {} },
  "project": { "id": "613b038f-e9bf-49ec-bc58-ba8d620754c7", "name": "Test Project Name" },
  "integration": { "id": "57a96b31-c69e-421a-bb32-7a25f9c6a893", "type": "slack" },
  "workflow": { "id": "cae72d65-7fc6-4249-9047-48fc640bfd46", "name": "Test Workflow Name" },
  "data": {
    "type": "workflow_failure",
    "workflowExecution": { "id": "07911c9b-2006-4348-938b-b7ebac94dc1f" },
    "stepExecution": { "stepId": "...", "instanceId": "...", "startTime": 1729629642606, "endTime": 1729629642606 },
    "error": "Test error message",
    "executionUrl": "https://dashboard.useparagon.com/connect/projects/.../executions/..."
  }
}
```

`credentials_failure` has `data: { "userId": "<User ID>", "error": "invalid_grant" }`.

If you edit the **Request Payload** template in the destination, the body is what you define.

## Delivery

Paragon may automatically disable a Webhook Destination that responds with too many non-2xx
status codes for consecutive events, so return `2xx` for events you don't handle.

## Full Event Reference

See [Managing Event Destinations](https://docs.useparagon.com/monitoring/event-destinations).
