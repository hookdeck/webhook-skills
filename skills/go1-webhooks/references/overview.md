# Go1 Webhooks Overview

## What Are Go1 Webhooks?

Go1 is a learning content platform. Its webhooks send an HTTPS POST with a JSON body to an endpoint you register whenever subscribed events happen, such as a learner being enrolled in a course. If you set a `secret_key` on the webhook, each request is signed with the `Go1-Signature` header (see [verification.md](verification.md)).

## Common Event Types

The event name is in the `event_type` field of the JSON body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `enrollment.create` | A learner is enrolled in a learning object | Provision access, sync to an LMS or HRIS |
| `enrollment.update` | An enrollment changes (e.g. progress or status) | Track completion, update records |
| `enrollment.delete` | An enrollment is removed | Revoke access, clean up records |

## Event Payload Structure

The body is a single JSON object. The fields confirmed in Go1's documentation example are:

```json
{
  "id": "ABnJ5giCDEFG",
  "event_type": "enrollment.create"
}
```

The rest of the object carries the event data. Treat any field beyond `id` and `event_type` as event-specific and check Go1's docs for the exact shape.

## Full Event Reference

For the complete list of events, see [Go1's webhook documentation](https://developers.go1.com/docs/developer-tools/webhooks/overview-webhooks/).
