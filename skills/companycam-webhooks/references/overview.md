# CompanyCam Webhooks Overview

## What Are CompanyCam Webhooks?

CompanyCam (job-site photos) sends an HTTP `POST` to your webhook URL when an event matching
the webhook's **scopes** occurs, so you don't need to poll the API. Your endpoint should reply
with exactly HTTP `200`.

## Common Event Types

| Event (`event_type`) | Triggered When | Common Use Cases |
|----------------------|----------------|------------------|
| `project.created` | A project is created | Sync to CRM / job system |
| `project.updated` | A project is updated | Keep records in sync |
| `photo.created` | A photo is created and processed | Backup, AI tagging, reports |
| `photo.updated` | A photo is edited (annotations) | Refresh derived assets |
| `comment.created` | A new comment is created | Notifications |
| `document.created` | A document is created for a project | File sync |
| `todo_list.completed` | A checklist is completed | Close-out workflows |
| `task.completed` | A checklist task is completed (not Project Tasks) | Progress tracking |

Other scopes: `project.label_added`, `project.contact_created`, `project.contact_updated`,
`project.merged`, `project.archived`, `project.deleted`, `photo.tag_added`,
`photo.description_updated`, `document.updated`, `video.created`, `video.updated`,
`todo_list.created`, `todo_list.deleted`. Wildcards: `*`, `project.*`, `photo.*`,
`comment.*`, `document.*`, `video.*`, `todo_list.*`, `task.*`.

## Event Payload Structure

```json
{
  "event_type": "project.created",
  "created_at": 1661361759,
  "payload": { "...": "the object, e.g. a Project for project.* events" },
  "webhook_id": 42
}
```

- `event_type` - the event and scope that triggered the webhook
- `created_at` - integer timestamp when the request was sent
- `payload` - the related object (`project.*` payloads match the Project object)
- `webhook_id` - id of the webhook that sent the request

## Retries

Any response other than exactly `200` is retried with exponential backoff, up to 10
attempts. A webhook whose total error count exceeds 25 is disabled; the count resets on each
successful response.

## Full Event Reference

See the [CompanyCam webhooks documentation](https://companycam.readme.io/docs/webhooks-1)
(legacy page listing the scopes) and the
[developer docs](https://developers.companycam.com/webhooks).
