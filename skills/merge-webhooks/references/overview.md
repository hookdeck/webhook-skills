# Merge Webhooks Overview

## What Merge Sends

Merge uses a double-webhook system. Third-party providers send their webhooks to Merge, and Merge sends **Merge webhooks** to you: inbound `POST` requests with a JSON body. This skill covers Merge webhooks. Webhooks are shared across your Merge organization.

| Field | Type | Meaning |
|---|---|---|
| `hook` | Object | The webhook that fired: `id`, `event`, `target` |
| `linked_account` | Object | The end user whose data changed: `id`, `integration`, `integration_slug`, `category`, `end_user_origin_id`, `end_user_organization_name`, `status`, `account_type` |
| `data` | Object | The affected data model, shaped like the matching API object |

## Event Types

From [Merge webhooks sent to you](https://docs.merge.dev/merge-unified/reading-data/webhooks/merge-webhooks):

| Webhook | `hook.event` | `data` |
|---|---|---|
| Linked Account linked | `LinkedAccount.linked` | `account_token`, `is_relink` |
| Linked Account synced | `LinkedAccount.sync_completed` | `is_initial_sync`, `integration_name`, `sync_status` per model |
| Linked Account deleted | `LinkedAccount.deleted` | none. Sent only after the account is fully removed, which can take a few hours |
| Linked Account issues | `Issue.new`, `Issue.reopened`, `Issue.muted`, `Issue.resolved` | The issue (`status`, `error_description`, `is_muted`, incident times) |
| Common Model synced | `{common_model}.synced` | `synced_fields`, `sync_status` |
| Changed data | `{common_model}.added`, `{common_model}.changed` | The latest version of the model |
| Deleted data | `{common_model}.removed` | The model with `remote_was_deleted: true` |
| Async Passthrough completed | `AsyncPassthrough.resolved` | The passthrough response. Top-level `async_passthrough_receipt_id` and `status`, no `linked_account` |
| Async POST completed | `AsyncPost.completed` | `task_id`, `status`, `model`, `result` |
| Async Bulk POST completed | `AsyncBulkPost.completed` | `batch_id`, counts and per-item `results` |

Subscribing to Linked Account issues subscribes you to all four issue events, so treat unexpected `hook.event` values as no-ops. Merge recommends Common Model sync and changed-data webhooks when you have a lot of data to keep in sync.

## Delivery and Retries

Merge's webhooks page doesn't state a retry policy. Merge's own agent skill for implementing webhooks ([merge-api/merge-unified-skills](https://github.com/merge-api/merge-unified-skills/blob/HEAD/skills/sync-implement-webhooks/SKILL.md)) says:

| Topic | Behaviour |
|---|---|
| Timeout | 10 seconds. Aim to answer in under 5 |
| Retries | One attempt plus 2 retries, backing off 1 s then 2 s |
| Retried on | `5xx`, connection errors and timeouts only |
| `4xx` | The event is dropped with no retry |

Three attempts within a few seconds don't cover a deploy window, so keep a reconciliation poll (sync status or a `modified_after` sweep) as a backstop. All webhooks are visible as logs in the [dashboard](https://app.merge.dev/logs/webhooks).
