# Outreach Webhooks Overview

## What Are Outreach Webhooks?

Outreach webhooks notify your service when resources change in Outreach, instead of you polling the REST API. A webhook is an ordinary API resource (`type: "webhook"`) with an HTTPS `url`, a `resource`, an `action` and an optional `secret`. `resource` and `action` default to `*` (everything). When a matching change happens, Outreach `POST`s a JSON:API document to your URL.

## Common Event Types

`meta.eventName` is `{resource}.{action}`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `prospect.created` | A prospect is created | Sync new leads to a CRM |
| `prospect.updated` | A prospect changes | Keep records in sync |
| `sequenceState.created` | A prospect is added to a sequence | Track enrollment |
| `sequenceState.finished` | A prospect finishes a sequence | Trigger follow-up |
| `call.created` | A call is logged | Update activity feeds |
| `task.completed` | A task is completed | Close tasks elsewhere |
| `mailing.replied` | A prospect replies to an email | Route replies |

Resources and their actions:

| Resource | Actions |
|----------|---------|
| `account`, `call`, `emailAddress`, `opportunity`, `opportunityProspectRole`, `prospect`, `sequence` | `created`, `updated`, `destroyed` |
| `mailing` | `created`, `updated`, `destroyed`, `bounced`, `delivered`, `opened`, `replied` |
| `sequenceState` | `created`, `updated`, `destroyed`, `advanced`, `finished` |
| `task` | `created`, `updated`, `destroyed`, `completed` |
| `import` | `created`, `finished` |
| `kaiaRecording`, `user` | `created` (and `updated` for `user`) |

## Event Payload Structure

Payload version 1 (default):

```json
{
  "data": {
    "type": "task",
    "id": 1,
    "attributes": { "completed": true, "completedAt": "2017-01-01T00:00:00", "state": "completed" }
  },
  "meta": { "deliveredAt": "2017-01-01T00:00:01", "eventName": "task.completed" }
}
```

- Create and update events contain only the created or changed attributes. Delete events contain the last known attributes and relationships.
- Create the webhook with `payloadVersion: 2` to also receive a `beforeUpdate` object with the previous values.
- `data` may also carry `relationships`.

## Delivery

Respond `200` within 5 seconds. Outreach does not retry on any HTTP status code, only on network failures (4 attempts, 1 second apart). Redirects are not followed. Webhooks that cannot be delivered for a week or more are disabled permanently.

## Full Event Reference

See [Outreach's webhook documentation](https://developers.outreach.io/api/webhooks).
