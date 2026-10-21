# Google Workspace Push Notifications Overview

## What Are Google Workspace Push Notifications?

Google Workspace APIs let you **watch** a resource instead of polling it. You
create a *notification channel* by calling the resource's `watch` method with a
webhook `address` (HTTPS), and Google POSTs a notification to that address
whenever the resource changes.

The same channel mechanism is shared by:

| API | Watch methods | Body |
|-----|---------------|------|
| Google Drive | `files.watch`, `changes.watch` | Empty |
| Google Calendar | `events.watch`, `acl.watch`, `calendarList.watch`, `settings.watch` | Empty |
| Admin SDK Directory | `users.watch` (one `event` type per channel) | JSON user summary |

Gmail `users.watch` is **not** part of this mechanism — it publishes to a Cloud
Pub/Sub topic. Use the
[google-pubsub-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/google-pubsub-webhooks)
skill for Gmail.

Key properties:

- **No signature.** Authenticity comes from the channel `token` you set,
  echoed in `X-Goog-Channel-Token`. See [verification.md](verification.md).
- **Headers carry everything.** The event type is the `X-Goog-Resource-State`
  header, not a body field.
- **Notifications are thin.** They tell you *that* something changed; you call
  the API to get *what* changed.
- **Channels expire** and cannot be extended. Create a replacement before expiry.
- **Delivery is best effort.** Google notes a small percentage of messages may be
  dropped, so keep a periodic sync as a fallback.

## Common Event Types (`X-Goog-Resource-State`)

### All APIs

| State | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sync` | A channel was just created (message number is always `1`) | Initialize state; or call `channels.stop` if you don't want the channel |

### Google Drive — `files.watch`

| State | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `add` | A resource was created or shared | Index the new file |
| `update` | One or more properties (metadata) were updated | Re-fetch with `files.get`; check `X-Goog-Changed` |
| `remove` | An existing resource was deleted or unshared | Remove from your index |
| `trash` | A resource was moved to the trash | Hide from your UI |
| `untrash` | A resource was removed from the trash | Restore in your UI |

`X-Goog-Changed` (for `update`) is a comma-separated list of: `content`,
`properties`, `parents`, `children`, `permissions`.

### Google Drive — `changes.watch`

| State | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `change` | One or more changelog items were added | Call `changes.list` with your saved page token |

Google's events table lists `change`, but its example notification shows
`X-Goog-Resource-State: changed`. The example handlers accept both.

### Google Calendar — events, ACLs, calendar lists, settings

| State | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `exists` | A resource in the collection was created, modified, or deleted | Run an incremental sync with your `syncToken` |
| `not_exists` | The watched resource no longer exists | Clean up the channel |

### Admin SDK Directory — `users.watch?event=…`

Each channel watches one event type, which is also the resource state:

| State | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `add` | A user was created | Provision accounts |
| `update` | A user was updated | Sync profile changes |
| `delete` | A user was deleted | Deprovision accounts |
| `undelete` | A user was undeleted | Re-provision |
| `makeAdmin` | A user's admin status changed | Audit privileged access |

Google may add new states over time. Handlers should ignore unknown values.

## Event Payload Structure

Drive and Calendar notification (empty body):

```http
POST https://mydomain.com/notifications
Content-Type: application/json; utf-8
Content-Length: 0
X-Goog-Channel-ID: 4ba78bf0-6a47-11e2-bcfd-0800200c9a66
X-Goog-Channel-Token: 3a98f1a2b3c4d5e6f7
X-Goog-Channel-Expiration: Tue, 19 Nov 2013 01:13:52 GMT
X-Goog-Resource-ID: ret08u3rv24htgh289g
X-Goog-Resource-URI: https://www.googleapis.com/drive/v3/files/ret08u3rv24htgh289g
X-Goog-Resource-State: update
X-Goog-Changed: content,properties
X-Goog-Message-Number: 11
```

Admin SDK Directory notification (JSON body):

```json
{
  "kind": "admin#directory#user",
  "id": "111220860655841818702",
  "etag": "\"Mf8RAmnABsVfQ47MMT_18MHAdRE/evLIDlz2Fd9zbAqwvIp7Pzq8UAw\"",
  "primaryEmail": "user@mydomain.com"
}
```

Requests use the `APIs-Google` user agent.

## Full Event Reference

- [Drive push notifications](https://developers.google.com/workspace/drive/api/guides/push)
- [Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [Admin SDK Directory push notifications](https://developers.google.com/workspace/admin/directory/v1/guides/push)
