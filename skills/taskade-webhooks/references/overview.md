# Taskade Webhooks Overview

> Only webhooks registered through the Taskade public API (Pro plan and above) are supported. Legacy webhooks are unsigned and fail verification.

## What Are Taskade Webhooks?

Taskade is an AI workspace and task manager. A signed outbound webhook sends an HTTP `POST` with a JSON body to your URL when the events you registered for happen, optionally scoped to workspaces. Register with `POST /api/v2/webhooks` or in **Settings > API** (Pro plan and above). The target must be `https` and at most 2,048 characters after URL encoding; an account can have up to 100 event-workspace combinations. The docs describe no retry policy, timeout or ordering, so respond quickly and keep handlers idempotent.

Two other Taskade surfaces are **not** covered here: inbound automation webhooks, and the no-code "automation + HTTP action" route. Their payloads (under "Receiving Taskade events" in the docs) differ from these deliveries.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `task.due` | A task's due date is reached | Reminders, escalation |
| `task.assigned` | A task is assigned to a person | Notify the assignee, sync to other tools |
| `comment.created` | A comment is added to a task | Mirror discussion |
| `project.created` | A project is created | Provision resources |
| `project.assigned` | A project is assigned to a person | Ownership sync |
| `project.joined` | Someone joins a project | Onboarding |

These six names are the only values the `events` array accepts at registration.

## Event Payload Structure

The body is the event's object, with no envelope and no field or header naming the event. Taskade's Delivery payload table lists each event's top-level fields:

| Event | Field only this event has | Other top-level fields |
|-------|---------------------------|------------------------|
| `task.due` | `taskEndDate` (also `text`, `id`) | `spaceName`, `spaceId`, `projectName`, `projectId`, `isCompleted`, `assignees`, `taskStartDate`, `taskStartTime`, `taskStartTimezone`, `taskEndTime`, `taskEndTimezone` |
| `task.assigned` | `assignedNodes[]` (also `nodes[]`, a copy) | `projectName`, `projectId`, `assignerName` |
| `comment.created` | `commentBody` | `projectName`, `projectId`, `nodeId`, `nodeText`, `commenterDisplayName`, `commenterHandle`, `commentBodyType`, `assignees`, `mentionedHandles` |
| `project.created` | `creatorName` | `spaceName`, `spaceId`, `projectName`, `projectId` |
| `project.assigned` | `assigneeId` | `spaceName`, `spaceId`, `projectName`, `projectId`, `assignerName`, `assigneeName` |
| `project.joined` | `joinerUserId` | `spaceId`, `projectName`, `projectId`, `joinerName` |

Route on those fields, or register one URL per event as Taskade suggests. Taskade prints no example body, so check a real delivery before relying on value types.

## Headers

| Header | Description |
|--------|-------------|
| `X-Taskade-Signature-V2` | `sha256=<hex>` HMAC-SHA256 of `<timestamp>.<raw body>` |
| `X-Taskade-Timestamp` | Send time in unix seconds |
| `X-Taskade-Signature` | `sha256=<hex>` HMAC-SHA256 of the raw body alone (older header, still sent) |

## Full Event Reference

See [Taskade's webhook documentation](https://docs.taskade.com/developers/webhooks#supported-events).
