# TextUs Webhooks Overview

## What Are TextUs Webhooks?

TextUs sends an HTTPS `POST` with a JSON body to your endpoint when a subscribed
event occurs (an inbound or delivered text, a completed call, a contact change).
Your endpoint must answer with a `2xx` status to acknowledge receipt.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | An incoming message is received | Route replies to your CRM or support queue |
| `message.delivered` | An outgoing message is delivered | Update delivery status |
| `message.failed` | An outgoing message failed to deliver | Alert, retry through another channel |
| `message.unknown` | An outgoing message could not be delivered due to an unknown error | Investigate, flag for follow-up |
| `phone_call.completed` | A phone call is completed | Log calls against a contact |
| `contact.opted_out` | A contact opted out of receiving text messages | Suppress the number in your systems |
| `contact.opted_in` | A contact opted in to receiving text messages | Re-enable messaging |
| `contact.created` | A contact is created | Sync new contacts |

The TextUs web app can only subscribe to `message.delivered` and
`message.received`. Subscribe to the rest with the Integrations API.

## Event Payload Structure

The documented delivery types share these fields:

| Field | Description |
|-------|-------------|
| `action` | The event that triggered the delivery (e.g. `message.received`) |
| `timestamp` | When the event happened |
| `webHook` | Link to the webhook that owns this delivery |

Plus the event object: `conversation` and `message` (message events),
`contact` (`contact.created`), or `optOut` (the phone number and account for
`contact.opted_out` / `contact.opted_in`).

For message events TextUs provides an identification field you can use to
detect duplicates.

## Delivery and Retries

- A `504` response is treated as transient: TextUs retries with exponential backoff for up to 12 hours.
- Any other `4xx`/`5xx` marks the integration as failed. TextUs pauses delivery, stores events, and retries hourly until your endpoint returns `2xx`, then replays the pending events.
- A slow response can cause a retry, so the same event may arrive twice: deduplicate.
- TextUs does not throttle events and publishes no IP ranges to allowlist.

## Full Event Reference

See [TextUs webhook documentation](https://apidocs.next.textus.com/overview/webhooks/webhooks-setup/).
