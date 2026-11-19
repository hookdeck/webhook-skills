# Kontent.ai Webhooks Overview

## What Kontent.ai Sends

A `POST` with `content-type: application/json; charset=utf-8` and a `notifications` array. Reserved headers include `x-kontent-ai-signature`, `request-id`, `request-context` and `traceparent`. Each webhook can add up to 10 custom headers.

## Payload

Each notification has:

| Field | Meaning |
|---|---|
| `data.system` | The changed object: `id`, `name`, `codename`, `last_modified`, plus `collection`, `workflow`, `workflow_step`, `language` and `type` for content items |
| `message.environment_id` | The environment |
| `message.object_type` | `content_item`, `asset`, `content_type`, `language` or `taxonomy` |
| `message.action` | What happened, for example `published` |
| `message.action_context` | Previous workflow and step, only for `workflow_step_changed` |
| `message.delivery_slot` | `published` or `preview` |

Only the directly changed object is included. Changing a content type doesn't produce notifications for its items.

## Event Types

- **Content items, published data:** `published`, `unpublished`, `metadata_changed`
- **Content items, preview data:** `created`, `changed`, `deleted`, `workflow_step_changed`, `metadata_changed`
- **Assets:** `created`, `changed`, `deleted`, `metadata_changed`
- **Content types and languages:** `created`, `changed`, `deleted`
- **Taxonomies:** `created`, `metadata_changed`, `deleted`, `term_created`, `term_changed`, `term_deleted`, `terms_moved`

## Delivery, Ordering and Retries

From the docs:

- Any 20X response counts as delivered. Anything else, or no response within 60 seconds, is retried.
- Retries wait 1, 2, 4, 8, 16, 32 and 60 minutes, then hourly for up to 3 days, after which the notification is dropped.
- Notifications are delivered in the order they were created, so a failing notification holds back the ones after it. In rare cases order isn't chronological: use `last_modified` when order matters.
- The webhook list shows a health status. A webhook is marked **Dead** when nothing has been accepted for 7 days. **Reset** resends the last failed notification.

Respond `200` quickly. A slow handler delays every later notification.
