# SavvyCal Webhooks Overview

## What Are SavvyCal Webhooks?

SavvyCal sends an HTTP POST with a JSON body to the URL you register whenever something happens in your account: a meeting is booked, rescheduled or canceled, a paid booking's checkout changes state, a poll gets a response, or a workflow action fires. Each request is signed with the webhook's secret in the `x-savvycal-signature` header.

Respond with `200 OK` quickly and process the body asynchronously. Non-2xx responses are retried with exponential backoff.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `event.created` | Someone books via a scheduling link, or an organizer approves an event that required approval | Create CRM record, send confirmation |
| `event.requested` | Someone books a link that requires approval | Notify the approver |
| `event.approved` | An organizer approves a requested event | Notify the attendee |
| `event.declined` | An organizer declines a requested event | Notify the attendee, free the slot |
| `event.rescheduled` | An existing event is rescheduled | Update calendar holds and CRM |
| `event.changed` | Any update to an event, with details of the change | Sync downstream systems |
| `event.canceled` | An existing event is canceled | Free up availability, win-back flow |
| `event.checkout.pending` | A paid event is booked, checkout still pending | Hold the slot, start abandoned-cart timer |
| `event.checkout.expired` | A paid event's checkout expires without payment | Release the slot |
| `event.checkout.completed` | A paid event's checkout succeeds | Mark paid, issue receipts |
| `event.attendee.added` | An attendee is added to an existing event | Update attendee lists |
| `event.attendee.canceled` | An individual cancels from a group event | Update headcount |
| `event.attendee.rescheduled` | An individual reschedules their response to a group event | Update headcount |
| `poll.response.created` | Someone responds to a poll | Track availability |
| `poll.response.updated` | Someone updates a poll response | Track availability |
| `workflow.action.triggered` | A workflow action is triggered | Run custom automation |

The example handlers in `examples/` dispatch on `event.created`, `event.rescheduled`, `event.canceled`, `event.changed`, and `event.checkout.completed`; every other type falls through to a default branch.

## Event Payload Structure

```json
{
  "type": "event.created",
  "id": "payload_XXXXXXXXXX",
  "...": "event-type-specific fields (see each event's schema in the SavvyCal docs)"
}
```

Request headers include `x-savvycal-signature`, `x-savvycal-webhook-id` (`wh_...`, identifies the webhook), and `User-Agent: SavvyCal Webhooks (https://savvycal.com)`.

## Full Event Reference

For the complete list of events and their schemas, see [SavvyCal's webhook documentation](https://developers.savvycal.com/webhooks).
