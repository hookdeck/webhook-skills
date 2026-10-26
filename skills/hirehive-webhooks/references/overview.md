# HireHive Webhooks Overview

## What Are HireHive Webhooks?

[HireHive](https://hirehive.com) is an applicant tracking system. When jobs, applications, candidates, feedback or interviews change, it sends an HTTP request with a JSON body to every webhook that listens for that event. Each webhook listens for one or more events, you can create any number of them, and each has its own signing secret. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification.

HireHive's pages print no HTTP method or `Content-Type`; they say they follow Standard Webhooks "for the header signature and payload of webhook request", and that spec says producers should POST. The examples accept any content type.

## Event Payload Structure

```json
{
  "type": "application.created",
  "timestamp": "2024-01-24T14:59:34.5220878Z",
  "data": { }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event type, for example `application.created`. This is what handlers switch on |
| `timestamp` | ISO 8601 time the event occurred |
| `data` | The object the event is about |

HireHive's overview shows `data` as `....`, so the example is not valid JSON and the fields inside `data` aren't documented there. Inspect a real delivery (the request log or the Hookdeck CLI) before reading specific fields.

There is no event id in the body. The `webhook-id` header is unique per message and stable across retries, so it is the idempotency key. No header carries the event type.

## Common Event Types

The examples route all 19 documented events:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `job.created` | A job is created | Publish it on your careers site |
| `job.updated` | A job is updated | Refresh the listing |
| `job.status.updated` | The status of a job changes | Show or hide the job on your site |
| `job.deleted` | A job is deleted | Remove the listing |
| `application.created` | A new application is created | Create a record in your HRIS or CRM, notify the team |
| `application.stage.updated` | An application moves to another stage | Send a contract offer when a candidate reaches a stage |
| `application.deleted` | An application is deleted | Remove synced records |
| `candidate.updated` | A candidate's details are updated | Sync contact details |
| `candidate.note.created` | A note is added to a candidate | Mirror notes elsewhere |
| `candidate.note.updated` | A candidate note is updated | Update the mirrored note |
| `candidate.note.deleted` | A candidate note is deleted | Delete the mirrored note |
| `candidate.tag.added` | A tag is added to a candidate | Trigger tag-based workflows |
| `candidate.tag.removed` | A tag is removed from a candidate | Undo tag-based workflows |
| `feedback.requested` | Feedback is requested for an application | Remind the reviewer |
| `feedback.submitted` | A feedback form is completed | Collect scores |
| `feedback.updated` | A feedback form is updated | Refresh scores |
| `interview.created` | An interview is created | Add a calendar entry |
| `interview.updated` | An interview is updated | Reschedule the entry |
| `interview.cancelled` | An interview is cancelled | Remove the entry |

HireHive says the list may not be exhaustive, so acknowledge and ignore types you don't recognise.

## Delivery Behaviour

- **Acknowledge** with any `2xx`. Anything else (non-2xx, timeouts, connection resets) is a failure and is retried.
- **Timeout:** 30 seconds. Return `200` first, then process asynchronously.
- **Retries:** immediately, then after 30 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 14 hours, 20 hours and 24 hours (the last attempt is about 75.5 hours after the first).
- **Replay:** the dashboard shows a request log for each webhook and can resend an event.
- **Ordering:** HireHive makes no ordering statement. Use `timestamp` if order matters.
- **Disabling:** you can enable or disable a webhook at any time. No automatic disabling rule is documented.

## Full Event Reference

For the complete list of events, see HireHive's [webhook overview](https://docs.hirehive.com/api-reference/webhooks/introduction) and its [retry schedule](https://docs.hirehive.com/api-reference/webhooks/webhook-retries).
