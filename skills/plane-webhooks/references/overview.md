# Plane Webhooks Overview

## What Are Plane Webhooks?

Plane (plane.so) is an open-source project management tool. Its webhooks push events to your server the moment something changes, so you don't have to poll the API. Webhooks work at the **workspace level**: one webhook can subscribe to events from every project in the workspace, and only Workspace Owners and Admins can create or manage them. Each delivery is a `POST` with a JSON body.

The current system is **v2**, which uses dot-notation event names and adds `event_id`, `delivery_id` and `previous_attributes`. Older webhooks are shown with a *(deprecated)* tag, still deliver, but don't get the v2 fields or names. Recreate them as new webhooks to migrate.

Work item events can be narrowed with a filter (Basic or PQL mode, for example `priority in ["urgent", "high"]`). Filters apply only to work item events; if a filter fails to evaluate, the delivery is skipped.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `workitem.created` | A work item is created | Sync to another tracker, notify a channel |
| `workitem.updated` | A work item is updated | React to state, priority or assignee changes |
| `workitem.deleted` | A work item is deleted | Remove it from your own records |
| `workitem.comment.created` | A comment is added to a work item | Bot commands, notifications |
| `project.updated` | A project is updated | Refresh cached project details |
| `cycle.created` | A cycle is created | Announce a new cycle |

## All Documented Events (43)

| Group | Events |
|-------|--------|
| Projects | `project.created`, `project.updated`, `project.archived`, `project.deleted` |
| Cycles | `cycle.created`, `cycle.updated`, `cycle.archived`, `cycle.deleted` |
| Modules | `module.created`, `module.updated`, `module.archived`, `module.deleted` |
| Milestones | `milestone.created`, `milestone.updated`, `milestone.deleted` |
| Pages | `page.created`, `page.updated`, `page.archived`, `page.deleted` |
| Page comments | `page.comment.created`, `page.comment.updated`, `page.comment.deleted` |
| Work items | `workitem.created`, `workitem.updated`, `workitem.archived`, `workitem.deleted` |
| Work item comments | `workitem.comment.created`, `workitem.comment.updated`, `workitem.comment.deleted` |
| Work item links | `workitem.link.created`, `workitem.link.updated`, `workitem.link.deleted` |
| Work item votes | `workitem.vote.created`, `workitem.vote.deleted` |
| Work item attachments | `workitem.attachment.created`, `workitem.attachment.updated`, `workitem.attachment.deleted` |
| Work item relations | `workitem.relation.created`, `workitem.relation.deleted` |
| Work item dependencies | `workitem.dependency.created`, `workitem.dependency.deleted` |
| Work item page links | `workitem.page_link.created`, `workitem.page_link.deleted` |

## Event Payload Structure

All v2 payloads share this top-level structure:

```json
{
  "version": "v2",
  "delivery_id": "<uuid>",
  "event_id": "<uuid>",
  "entity_id": "<uuid>",
  "entity_type": "issue",
  "event": "workitem.comment.created",
  "webhook_id": "<uuid>",
  "workspace_id": "<uuid>",
  "data": {},
  "previous_attributes": {}
}
```

| Field | Description |
|-------|-------------|
| `event` | Dot-notation event name (also in the `X-Plane-Event` header) |
| `event_id` | Stable across retries. Use it for deduplication |
| `delivery_id` | New UUID for each delivery attempt (also in `X-Plane-Delivery`) |
| `entity_id` / `entity_type` | The primary entity affected, e.g. `issue`, `cycle`, `issue_comment`, `issue_link` |
| `data` | Full entity object for create and update events; `{}` for delete events |
| `previous_attributes` | Previous values of changed fields on updates; the full record before deletion on deletes; `{}` otherwise |

For `workitem.comment.created`, the comment is nested at `data.comment` (with `comment_stripped` holding the plain text). Treat every field as untrusted and check types before reading into it.

## Known Quirk

One of the work item examples in Plane's docs shows `event` as `WebhookScope.ScopeChoices.WORK_ITEM_UPDATED` instead of `workitem.updated`. The example handlers map that value to `workitem.updated`; log and ignore anything else you don't recognize.

## Full Event Reference

For the complete list of events and payload examples, see [Plane's webhook documentation](https://developers.plane.so/dev-tools/intro-webhooks).
