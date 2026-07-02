# WorkOS Webhooks Overview

## What Are WorkOS Webhooks?

[WorkOS](https://workos.com) is an enterprise-readiness platform providing SSO,
Directory Sync (SCIM), and AuthKit / User Management. Webhooks let WorkOS push
real-time notifications to your application when something changes in a connected
identity provider or in your WorkOS environment — for example, when an IT admin
provisions a user in Okta (Directory Sync), when an SSO connection is activated,
or when a user signs in (User Management).

Each event is delivered as an HTTP `POST` to an endpoint URL you configure in the
WorkOS Dashboard. The request carries a JSON body and a `WorkOS-Signature` header
you must verify before trusting the payload.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `dsync.user.created` | A user is added in a synced directory | Provision the user in your app |
| `dsync.user.updated` | A directory user's attributes change | Sync profile/role changes |
| `dsync.user.deleted` | A user is removed from a directory | Deprovision / revoke access |
| `dsync.group.created` | A directory group is created | Mirror groups/teams |
| `dsync.group.user_added` | A user is added to a directory group | Grant group-based permissions |
| `dsync.group.user_removed` | A user is removed from a directory group | Revoke group-based permissions |
| `connection.activated` | An SSO connection is activated | Enable SSO login for the org |
| `connection.deactivated` | An SSO connection is deactivated | Disable SSO login |
| `user.created` | A User Management user is created | Create a local user record |
| `user.updated` | A User Management user changes | Sync user profile |
| `session.created` | A user authenticates, starting a session | Audit logins, hydrate session |
| `session.revoked` | A user session is revoked | Force logout / cleanup |

## Event Payload Structure

Every webhook body shares the same envelope. Note the type is in the `event`
field (not `type`):

```json
{
  "id": "event_01H...",
  "event": "dsync.user.created",
  "data": {
    "id": "directory_user_01H...",
    "object": "directory_user",
    "created_at": "2026-07-02T12:00:00.000Z",
    "updated_at": "2026-07-02T12:00:00.000Z"
  },
  "created_at": "2026-07-02T12:00:00.000Z"
}
```

- `id` — unique event ID (use it for idempotency / dedup).
- `event` — the event type string (e.g. `dsync.user.created`).
- `data` — the full object involved in the event; shape depends on the event.
- `created_at` — when the event occurred.

The `@workos-inc/node` SDK deserializes this into an `Event` where the type is
`event.event`, the object is `event.data`, and the ID is `event.id`.

## Full Event Reference

For the complete list of events and payloads, see the
[WorkOS Events documentation](https://workos.com/docs/events) and the
[Webhooks guide](https://workos.com/docs/events/data-syncing/webhooks).
