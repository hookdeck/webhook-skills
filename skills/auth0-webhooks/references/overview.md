# Auth0 Webhooks Overview

## What Are Auth0 Event Streams?

Auth0 Event Streams deliver real-time notifications about changes in your
tenant, such as a user being created or added to an organization. A stream
subscribes to the event types you choose and sends them to a destination:
a webhook (covered here), AWS EventBridge or an Auth0 Action. Auth0 also offers
an Events API that serves the same events as a Server-Sent Events stream you
pull from.

Event Streams became generally available on April 30, 2026. The dashboard
still labels the page **Event Streams (Early)**, and some event types are
Early Access (see below).

Key characteristics:

- **One event per request**: Auth0 delivers each event to your webhook URL as
  an HTTP `POST` with a JSON body.
- **No signature**: requests carry the authorization you configured on the
  stream (see [verification.md](verification.md)).
- **Short retry window**: four attempts in total, with retries after 1s, 2s and
  4s. A `4xx` response fails the event with no retry.
- **Duplicates and ordering**: an endpoint may receive the same event more than
  once, and events aren't guaranteed to arrive in the order they happened.

## Event Envelope

Events follow the CloudEvents specification. This is the `user.created`
example from Auth0's Event Catalog, shortened to a few `data.object` fields:

```json
{
  "specversion": "1.0",
  "type": "user.created",
  "source": "urn:auth0:example.auth0app.com",
  "id": "evt_vjFVP5pVdfvsfRKatshkVV",
  "time": "2025-02-01T12:34:56Z",
  "data": {
    "object": {
      "user_id": "auth0|507f1f77bcf86cd799439020",
      "created_at": "2025-02-01T12:34:56Z",
      "updated_at": "2025-02-01T12:34:56Z"
    }
  },
  "a0tenant": "my-tenant",
  "a0stream": "est_vjFVP5pVdfvsfRKatshkVV"
}
```

- `type`: the event type. Dispatch on this.
- `id`: identifies the event. Record it to skip duplicates.
- `time`: when the event happened. Compare it with your stored data so an
  older event doesn't overwrite a newer one.
- `data.object`: the entity after the change. Some events also carry
  `data.previous_object` and `data.context` (client, connection, request).
- `a0stream`: the event stream that delivered it. Test events sent from Auth0
  also carry `a0purpose: "test"`.

## Event Types

Auth0's Event Catalog lists these types:

| Category | Events |
|----------|--------|
| User | `user.created`, `user.updated`, `user.deleted`, `user.role.assigned`, `user.role.deleted` |
| Organization | `organization.created`, `organization.updated`, `organization.deleted`, `organization.member.added`, `organization.member.deleted`, `organization.member.role.assigned`, `organization.member.role.deleted`, `organization.connection.added`, `organization.connection.updated`, `organization.connection.removed`, `organization.group.role.assigned`, `organization.group.role.deleted` |
| Group | `group.created`, `group.updated`, `group.deleted`, `group.member.added`, `group.member.deleted`, `group.role.assigned`, `group.role.deleted` |
| Role | `role.created`, `role.updated`, `role.deleted` |
| Connection | `connection.created`, `connection.updated`, `connection.deleted` |

The catalog marks `connection.created`, `connection.updated`,
`connection.deleted`, `group.member.added` and `group.member.deleted` as Early
Access.

## Full Event Reference

- [Auth0 Event Catalog](https://auth0.com/docs/events)
- [Events Best Practices](https://auth0.com/docs/customize/events/events-best-practices)
- [How to Test, Monitor, and Retry Event Streams](https://auth0.com/docs/customize/events/event-testing-observability-and-failure-recovery)
