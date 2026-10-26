# Nextcloud Webhooks Overview

## What Are Nextcloud Webhooks?

The `webhook_listeners` app ships with Nextcloud (enable it with `occ app:enable webhook_listeners`).
It watches Nextcloud's internal event system and sends an HTTP request to a URI you register
whenever a matching event fires. Listeners are managed through the OCS API (or the optional
`orchestration_gateway` app's UI) by an administrator or a user with delegated "Webhooks" rights,
and listed with `occ webhook_listeners:list`.

Requests are **not signed**. The only authentication Nextcloud offers is `authMethod: "header"`,
which merges the `authData` you registered into the request headers.

Delivery runs as a background job, so with the default 5-minute cron interval events can arrive
minutes late. Run `background-job:worker` processes for faster dispatch.

## What Does a Request Look Like?

The HTTP method is whatever `httpMethod` was registered (POST is typical), and the body is JSON:

```json
{
  "event": {
    "class": "OCP\\Files\\Events\\Node\\NodeCreatedEvent",
    "node": { "id": 437, "path": "/admin/files/test-webhook.txt" }
  },
  "user": { "uid": "admin", "displayName": "Admin" },
  "time": 1700100000
}
```

- `event.class`: fully-qualified PHP class name (backslashes are doubled in JSON).
- `user`: who triggered the event; `null` when there is no user session.
- `time`: Unix timestamp (integer) of when the event was captured.

## Common Event Types

| `event.class` | Triggered When | Event fields |
|---------------|----------------|--------------|
| `OCP\Files\Events\Node\NodeCreatedEvent` | File or folder created | `node.id`, `node.path` |
| `OCP\Files\Events\Node\NodeWrittenEvent` | File written | `node.id`, `node.path` |
| `OCP\Files\Events\Node\NodeTouchedEvent` | Node touched | `node.id`, `node.path` |
| `OCP\Files\Events\Node\NodeDeletedEvent` | Node deleted | `node.path` (`node.id` usually absent) |
| `OCP\Files\Events\Node\NodeCopiedEvent` | Node copied | `source`, `target` |
| `OCP\Files\Events\Node\NodeRenamedEvent` | Node renamed or moved | `source`, `target` |
| `OCP\Files\Events\Node\NodeRestoredEvent` | Node restored from trash | `source`, `target` |
| `OCP\SystemTag\TagAssignedEvent` | System tag assigned | see docs |
| `OCP\SystemTag\TagUnassignedEvent` | System tag unassigned | see docs |
| `OCP\Calendar\Events\CalendarObjectCreatedEvent` | Calendar object created | `calendarId`, object data |
| `OCP\Calendar\Events\CalendarObjectUpdatedEvent` | Calendar object updated | `calendarId`, object data |
| `OCP\Calendar\Events\CalendarObjectDeletedEvent` | Calendar object deleted | `calendarId`, object data |
| `OCA\Forms\Events\FormSubmittedEvent` | Form submitted | form and submission data |

Also documented: `Before*` variants of the node events (`BeforeNodeCreatedEvent`,
`BeforeNodeTouchedEvent`, `BeforeNodeWrittenEvent`, `BeforeNodeReadEvent`,
`BeforeNodeDeletedEvent`, `BeforeNodeCopiedEvent`, `BeforeNodeRestoredEvent`,
`BeforeNodeRenamedEvent`; use these when you need the `id` of a node about to be deleted),
`OCP\Calendar\Events\CalendarObjectMovedToTrashEvent`, `CalendarObjectRestoredEvent` and
`CalendarObjectMovedEvent`, Tables (`OCA\Tables\Event\RowAddedEvent`, `RowUpdatedEvent`,
`RowDeletedEvent`) and Mail (`OCA\Mail\Event\NewMessageReceivedEvent`, `MessageSentEvent`,
`MessageFlaggedEvent`, `MessageDeletedEvent`). Optional apps can register further events; the set
on your server depends on its version and installed apps.

## Gotchas in the Payload

- **Check for `node.id`.** Deleted or missing nodes have only `path`.
- **`user` can be `null`.**
- **Dispatch on the full class name.** Match `OCP\\Files\\Events\\Node\\NodeCreatedEvent` in code
  (escaped backslashes), not just `NodeCreatedEvent`.

## Full Event Reference

See [Nextcloud's webhook listeners documentation](https://docs.nextcloud.com/server/latest/admin_manual/webhook_listeners/index.html).
