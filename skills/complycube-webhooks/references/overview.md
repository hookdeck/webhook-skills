# ComplyCube Webhooks Overview

## What Are ComplyCube Webhooks?

ComplyCube (KYC, AML and identity verification) notifies your application when something happens in
your account, most usefully when an asynchronous check concludes. Each webhook endpoint subscribes
to a list of event types (`["*"]` means all). The body is an Event object; the event name is its
`type` field, and there is no header naming the event.

Delivery: reply `20x` within 15 seconds. Otherwise ComplyCube retries up to 10 times with
exponential backoff (60 s, then 120 s, then 480 s, and so on), after which the webhook is disabled.
Duplicates are possible and order is not guaranteed.

## Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `workflow.session.started` | A workflow session has been started | Track onboarding progress |
| `workflow.session.cancelled` | A workflow session has been cancelled | Clean up pending onboarding |
| `workflow.session.processing` | The customer finished all steps; checks are in progress | Show a "pending review" state |
| `workflow.session.completed` | A workflow session has been completed | Approve or reject the customer |
| `workflow.session.updated` | A workflow session outcome has been updated | Re-evaluate a decision |
| `check.pending` | A check was created and is pending | Track check creation |
| `check.completed` | A check completed with any outcome | Fetch the check and decide |
| `check.completed.clear` | A check completed with a `clear` outcome | Approve the customer |
| `check.completed.attention` | A check completed with an `attention` outcome | Route to manual review |
| `check.completed.rejected` | A check completed with a `rejected` outcome | Decline the customer |
| `check.completed.match_confirmed` | A check completed with a `match_confirmed` outcome | Escalate a confirmed screening match |
| `check.monitoring.attention` | A monitoring check completed with `attention` | Ongoing AML monitoring alerts |
| `check.failed` | A check has failed | Retry or alert |
| `check.updated` | A check has been updated | Sync state |
| `client.created` | A client has been created | Sync customers |
| `client.updated` | A client has been updated | Sync customers |
| `client.deleted` | A client has been deleted | Sync customers |
| `document.created` | A document has been created | Track uploads |
| `document.updated` | A document has been updated | Track changes |
| `document.updated.image_uploaded` | A document got a new image | Trigger a document check |
| `document.updated.image_deleted` | A document image was deleted | Track changes |
| `document.deleted` | A document has been deleted | Sync state |
| `address.created` | An address has been created | Track records |
| `address.updated` | An address has been updated | Track records |
| `address.deleted` | An address has been deleted | Track records |

A completed check fires `check.completed` and, if you subscribed to it, the outcome-specific type too.
Subscribe only to the events you need.

## Event Payload Structure

```json
{
  "id": "5ed170fe99c81a0007b9a3d3",
  "type": "check.completed.clear",
  "resourceType": "check",
  "payload": {
    "id": "5ed3918fbf06f30008e552c9",
    "outcome": "clear",
    "status": "complete",
    "createdAt": "2020-01-01T11:14:23.964Z",
    "updatedAt": "2020-01-01T11:14:23.964Z"
  },
  "createdAt": "2020-01-01T11:14:23.964Z"
}
```

- `id` - unique event id; use it to skip duplicate deliveries
- `type` - the event type
- `resourceType` - the kind of object in `payload`
- `payload` - the object (a check, client, document, address or workflow session)

## Full Event Reference

See [ComplyCube's webhook documentation](https://docs.complycube.com/documentation/api-reference/other-resources/webhooks)
and the [Webhooks Guide](https://docs.complycube.com/documentation/guides/webhooks).
