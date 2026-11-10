# Go1 Webhooks Overview

## What Are Go1 Webhooks?

Go1 is a learning content platform. Its webhooks send an HTTPS POST with a JSON body to an endpoint you register whenever subscribed events happen, such as a learner completing a course. If you set a `secret_key` on the webhook, each request is signed with the `Go1-Signature` header (see [verification.md](verification.md)).

## Common Event Types

The event name is in the `event_type` field of the JSON body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `enrollment.create` | A learner starts, or is assigned, a learning object | Create the enrollment record in your LMS or HRIS |
| `enrollment.complete` | A learner completes a learning object | Mark the course complete in your system |
| `enrollment.delete` | An enrollment is deleted | Remove the enrollment record |
| `content.add` / `content.remove` | A learning object becomes available to, or is removed from, a portal | Keep your catalogue in step |
| `content.library.add` / `content.library.remove` / `content.library.update` | A portal's curated Library changes | Import, remove or refresh curated content |
| `content.decommission.pending` / `content.decommission` | A learning object is scheduled for, or reaches, decommissioning | Warn users and stop new enrollments |

Go1 documents 13 event types; the full list is on its [webhooks overview](https://developers.go1.com/docs/developer-tools/webhooks/overview-webhooks/).

## Event Payload Structure

The body is a single JSON object with the same envelope for every event. This is the example from Go1's [webhook security docs](https://developers.go1.com/docs/developer-tools/webhooks/security/):

```json
{
  "id": "ABnJ5giCDEFG",
  "event_type": "enrollment.create",
  "webhook_version": "3.0.0",
  "sent": "2024-02-01T00:36:42.205Z",
  "attempt_number": 1,
  "url": "https://your.webhook.endpoint.com",
  "webhook_id": "5xwTAgL6GyEu",
  "data": {
    "id": "115799069",
    "lo_id": "36534258",
    "portal_id": "77180683",
    "event_time": "2024-02-01T00:36:42.000Z"
  }
}
```

`id` is the same on every retry, so use it to deduplicate. `data` holds IDs only (the enrollment or learning object, `lo_id` for enrollments, and `portal_id`) plus `event_time`; fetch the full record from the Go1 API when you need it.

## Full Event Reference

For the complete list of events, see [Go1's webhook documentation](https://developers.go1.com/docs/developer-tools/webhooks/overview-webhooks/).
