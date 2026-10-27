# Podium Webhooks Overview

## What Are Podium Webhooks?

Podium (podium.com) is a customer messaging, reviews and payments platform for local businesses.
Webhooks notify your endpoint when something happens in a Podium location or organization, such as a
message arriving or a review being posted. Each webhook belongs to exactly one location or
organization, is created and managed through the webhook API resource, and needs a token that has the
scopes of the event types you subscribe to.

## Common Event Types

Event types have the form `API_OBJECT.ACTION`. The examples in this skill handle these seven:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | A message arrives for a location | Route to a support queue, auto-reply |
| `message.sent` | A message is sent | Sync conversation history |
| `contact.created` | A contact is created | Add the contact to your CRM |
| `contact.updated` | A contact is updated | Keep CRM fields in sync |
| `review.created` | A review is posted | Alert the team, request a response |
| `invoice.payment_succeeded` | An invoice payment succeeds | Mark an order paid |
| `call.completed` | A call completes | Log the call in your CRM |

Podium documents 26 event types in all. The rest in the same families are `message.failed`,
`contact.deleted`, `contact.merged`, `contact.unchanged`, `review.updated`, `review.invite_link_created`,
`review.invite_link_updated`, `review.response_created`, `review.response_updated`, `invoice.created`,
`invoice.disabled`, `invoice.marked_as_paid`, `invoice.payment_created`, `invoice.payment_failed`,
`invoice.refund_created`, `invoice.refund_failed`, `call.missed`, `call.received` and `call.voicemail_left`.

## Event Payload Structure

```json
{
  "data": { "uid": "..." },
  "metadata": { "event_type": "message.received", "version": "2021.04.01" }
}
```

`data` is the full object for the event; its fields depend on the event type. `metadata.event_type`
names the event and `metadata.version` is the payload version. Dispatch on `metadata.event_type`.

## Delivery Format

Signed deliveries carry two headers (see [verification.md](verification.md)):

```
podium-signature: <64-char lowercase hex HMAC-SHA256>
podium-timestamp: 1620936594591
```

Podium's docs don't name the HTTP method. Responses time out after **5 seconds**, so acknowledge
quickly and do the work asynchronously.

## Queueing, Retries and Idempotency

Events are queued from the moment the webhook is created, even while it is disabled, and stay in
the queue for about 10 days. No retry schedule is documented and no delivery id header is sent, so
make handlers idempotent on your own key (for example the object `uid` in `data`).

## Full Event Reference

See [Webhooks](https://docs.podium.com/docs/webhooks),
[Verifying webhook signatures](https://docs.podium.com/docs/verifying-webhook-signatures) and
[The webhook object](https://docs.podium.com/reference/the-webhook-object).
