# Demodesk Webhooks Overview

## What Are Demodesk Webhooks?

Demodesk is a sales meeting platform. Company admins can register webhook endpoints that receive
real-time updates about meetings ("demos") and their recordings. Each endpoint has a URL, **one
event** and optional custom headers. Requests are not signed; the custom headers are how a receiver
confirms a request came from your Demodesk account (see [verification.md](verification.md)).

Demodesk can disable an endpoint that keeps failing, so return `200` quickly and handle work
asynchronously.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `demo.scheduled` | A meeting is scheduled | Create the meeting in your CRM |
| `demo.rescheduled` | A meeting is moved | Update the meeting time |
| `demo.event_response_updated` | An invitee's response changes | Track attendance |
| `demo.handovered` | A meeting is handed over to another host | Reassign the owner |
| `demo.canceled` | A meeting is canceled | Cancel downstream records |
| `demo.started` | A meeting starts | Mark as in progress |
| `demo.call_note_updated` | A call note is updated | Sync notes |
| `demo.ended` | A meeting ends | Log the outcome |
| `recording.uploaded` | A recording is uploaded | Fetch the recording |
| `recording.transcription_postprocessed` | A transcript finishes post-processing | Fetch the transcript |

`demo.ended` can be sent more than once for the same demo with different statuses: when a meeting
is ended and then restarted, a second `demo.ended` reflects the updated state. Handle it
idempotently.

## Event Payload Structure

The body is JSON sent with `POST`. The event name is at `meta.event.action`:

```json
{
  "meta": { "event": { "action": "demo.scheduled" } },
  "data": { }
}
```

The `data` contents depend on the event. See Demodesk's
[webhook payload reference](https://demodesk.ai/help/api-reference#webhook-api) for each event's
fields; the examples here read only `meta.event.action`.

## Full Event Reference

See [Demodesk's webhook documentation](https://demodesk.ai/help/how-to-generate-an-api-key-and-manage-webhooks).
