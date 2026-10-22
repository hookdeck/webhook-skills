# Storyblok Webhooks Overview

## What Are Storyblok Webhooks?

Storyblok webhooks notify an external service when something happens in a space: a story is published, an asset is uploaded, a user is removed, a discussion is created. Typical uses are rebuilding a static site, purging a CDN or cache, re-indexing search, or syncing content elsewhere.

Each trigger fires on actions made in the Storyblok app or through the Management API, and sends one JSON `POST` to your endpoint. Your endpoint must reply with a `2xx` status and `content-type: application/json`.

## Common Event Types

There is no event-type header. The event is the `action` field in the body. `action` alone can be ambiguous across entities (`created` and `deleted` exist for assets, discussions, and stories), so combine it with the entity field.

| Entity | `action` | Triggered When | Common Use Cases |
|--------|----------|----------------|------------------|
| Story | `published` | A user published a story | Rebuild site, purge cache |
| Story | `unpublished` | A user unpublished a story | Remove page from site or search |
| Story | `deleted` | A user deleted a story | Remove page, clean up |
| Story | `moved` | A user moved a story to another folder | Update redirects (`old_full_slug` -> `full_slug`) |
| Asset | `created` / `replaced` / `deleted` / `restored` | Asset uploaded, replaced, deleted, restored | Sync to a DAM or CDN |
| Workflow | `stage.changed` | A story's workflow stage changed | Notify reviewers |
| User | `added` / `removed` / `roles_updated` | Space membership changes | Audit logging |
| Datasource | `entries_updated` | A datasource entry was saved or added | Refresh dropdown data or caches |
| Datasource | `entries_deleted` | A datasource entry was deleted | Refresh dropdown data or caches |
| Discussion | `created`, `resolved`, `comment_created`, `comment_deleted`, `comment_updated` | Editor discussions | Chat notifications |
| Experiment | `experiment.created`, `experiment.started`, `experiment.resumed`, `experiment.paused`, `experiment.completed`, `experiment.winner_selected`, `experiment.deleted` | Experiment lifecycle (paid plans, enable in Settings → Labs) | Analytics sync |
| Release | `merged` | A release was published (Releases app, paid plans) | Rebuild site |
| Pipeline | `deployed` | A pipeline stage was deployed (Pipelines app, paid plans) | Trigger downstream deploys |
| Task | `task_execution` | A user ran a task (Tasks app) | Manual triggers. **Unsigned** |

## Event Payload Structure

Universal fields on every payload: `text` (human-readable summary), `action`, `space_id`. Entity fields follow:

```json
{
  "text": "The user joy.bringer@storyblok.com moved the Story Home 2 (marketing-articles/home-2)\nhttps://app.storyblok.com/#/me/spaces/184738/stories/0/0/166888799188279",
  "action": "moved",
  "space_id": 184738,
  "story_id": 166888799188279,
  "full_slug": "marketing-articles/home-2",
  "old_full_slug": "home-2"
}
```

| Entity | Fields beyond `text`, `action`, `space_id` |
|--------|--------------------------------------------|
| Story | `story_id`, `full_slug`, `old_full_slug` (moved only) |
| Asset | `asset_id` |
| Workflow | `story_id`, `workflow_name`, `workflow_stage_name` |
| User | `user_id` |
| Datasource | `datasource_slug` |
| Discussion | `id`, `lang`, `title`, `story_id`, `block_uid`, `component`, `fieldname` |
| Experiment | `experiment_id`, `status` |
| Release | `release_id` |
| Pipeline | `branch_id` |
| Task | `task` (`id`, `name`), `dialog_values`; `space_id` is a string |

The payload carries IDs, not content. After a `published` event, fetch the story from the Content Delivery API if you need the content.

## Delivery Behavior

- No retries on failure. A missed delivery is lost, so respond quickly.
- Respond within 120 seconds; for longer work, reply `202 Accepted` and process asynchronously.
- No event ID is sent, so de-duplicate on a composite such as `action` + entity ID where needed.
- Source IPs are static per region (see [setup.md](setup.md)).

## Full Event Reference

For the complete list of events and example payloads, see [Storyblok's webhook documentation](https://www.storyblok.com/docs/concepts/webhooks).
