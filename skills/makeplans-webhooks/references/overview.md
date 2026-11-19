# MakePlans Webhooks Overview

## What MakePlans Sends

A webhook is "a user-defined callback in the form of an HTTP POST which is invoked when something happens". The JSON body describes the event and the changed object, and the `X-MakePlans-Signature` header signs it.

## Payload

| Field | Type | Meaning |
|---|---|---|
| `event` | String | Type of event |
| `idempotency_id` | String | Unique ID for this webhook |
| `generated_at` | String | When the event was initialised |
| `performed_by` | Object | Info about the user who performed the event |
| `data` | Object | The related object |

`data` holds `object` (the type), `id` (an integer) and a key named after the object type (`booking`, `person`, `event`, `message`) with the object's payload. The root also repeats `object`, `id` and the object key. Those copies are deprecated and will be removed.

## Events

From the [webhooks guide](https://developer.makeplans.com/guide/webhooks/):

- `booking.cancelled`, `booking.confirmed`, `booking.created`, `booking.declined`, `booking.deleted`, `booking.modified`, `booking.verified`, `booking.waitlist_promoted`, `booking.waitlisted`
- `event.created`, `event.deleted`, `event.modified`
- `message.processed`
- `person.created`, `person.deleted`, `person.updated`

Use `*` for all events or `booking.*` for one group.

## Delivery

- MakePlans retries after **any 4xx or 5xx** response, "as they may be caused by temporary issues on the receiving end". The maximum is **20 retries**.
- The timeout is **10 seconds**.
- A **`410 Gone`** response isn't retried. It deactivates the webhook.
- Dedupe on `idempotency_id`.

## Other Authentication

Besides the signature, you can put HTTP Basic Auth credentials or a secret query parameter in the webhook URL.
