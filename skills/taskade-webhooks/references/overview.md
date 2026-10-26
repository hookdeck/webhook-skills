# Taskade Webhooks Overview

> Only webhooks registered through the Taskade public API (Pro plan and above) are supported. Legacy webhooks are unsigned and fail verification.

## What Are Taskade Webhooks?

Taskade is an AI workspace and task manager. A signed outbound webhook sends an HTTP `POST` to your URL when the events you registered for happen, optionally scoped to workspaces. Register with `POST /api/v2/webhooks` or in **Settings > API** (Pro plan and above). The target must be `https` (SSRF-guarded) and at most 2,048 characters; an account can have up to 100 event-workspace combinations. The docs describe no retry policy or timeout, so respond quickly and keep handlers idempotent.

Two other Taskade surfaces are **not** covered here: inbound automation webhooks, and the no-code "automation + HTTP action" route. Their payloads (under "Receiving Taskade Events" in the docs) are unsigned and differ from these deliveries.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `task.due` | A task reaches its due date | Reminders, escalation |
| `task.assigned` | A task is assigned | Notify the assignee, sync to other tools |
| `comment.created` | A comment is added | Mirror discussion, trigger AI review |
| `project.created` | A project is created | Provision resources |
| `project.assigned` | A project is assigned | Ownership sync |
| `project.joined` | Someone joins a project | Onboarding |

These six names are the documented values for the `events` array at registration.

## Event Payload Structure

The docs do not show a delivery body or an event header for registered webhooks, so where a delivery names its event is not documented. The examples take the name from the JSON payload's `event` or `type` field when present and log everything else. Verify the signature first, then check a real delivery in your logs before relying on specific fields.

## Headers

| Header | Description |
|--------|-------------|
| `X-Taskade-Signature` | `sha256=<hex>` HMAC-SHA256 of the raw body |

## Full Event Reference

See [Taskade's webhook documentation](https://docs.taskade.com/developers/webhooks).
