# Hexclave Webhooks Overview

## What Are Hexclave Webhooks?

Hexclave (formerly Stack Auth) sends a webhook when a user, team, team membership or team permission is created, updated or deleted in your project. A webhook is a JSON `POST` to the endpoint you create in the dashboard's Webhooks section. Delivery runs on [Svix](https://www.svix.com/), so each request carries `svix-id`, `svix-timestamp` and `svix-signature` headers. Hexclave's docs still say "Stack" in places.

## What Are the Common Event Types?

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user.created` | A user is created | Create the user in your database, send a welcome email |
| `user.updated` | A user changes | Sync profile fields |
| `user.deleted` | A user is deleted | Remove or anonymise local data |
| `team.created` | A team is created | Provision a workspace |
| `team.updated` | A team changes | Sync the team name |
| `team.deleted` | A team is deleted | Clean up workspace data |
| `team_membership.created` | A user is added to a team | Grant access |
| `team_membership.deleted` | A user is removed from a team | Revoke access |
| `team_permission.created` | A permission is granted on a team | Update access rules |
| `team_permission.deleted` | A permission is removed from a team | Update access rules |

These are the 10 types Hexclave documents; the list may not be exhaustive.

## Event Payload Structure

The body is `{ type, data }`:

```json
{
  "type": "team.created",
  "data": {
    "id": "2209422a-eef7-4668-967d-be79409972c5",
    "display_name": "My Team"
  }
}
```

`type` is the event name; `data` is the affected object. The overview page elides the remaining `data` fields, so check each event's schema in the API reference.

## Delivery

Hexclave's documentation gives no timeout, retry schedule or ordering guarantee. Return a `2xx` quickly and deduplicate on `svix-id`.

## Full Event Reference

See Hexclave's [webhooks overview](https://docs.hexclave.com/guides/apps/webhooks/overview) and the [webhook API reference](https://docs.hexclave.com/api/webhooks/users/usercreated).
