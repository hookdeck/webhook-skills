# BigMailer Webhooks Overview

## What Are BigMailer Webhooks?

BigMailer (bigmailer.io) is a multi-brand email marketing platform that sends through Amazon SES. It POSTs a JSON body to your HTTPS URL when recipients engage with, or fail to receive, your campaigns. Endpoints are configured per account (console → API settings) and receive events for the account's brands; the `brand_id` field says which brand an event belongs to.

Every request is signed with the endpoint's signing secret in `X-BigMailer-Signature` (see [verification.md](verification.md)).

## Common Event Types

The event type is the top-level `type` field of the body. The event's data sits under a key with the same name.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `bounce` | A message bounces (`bounce.type` is `hard` or `soft`) | Suppress hard-bounced addresses, track deliverability |
| `click` | A recipient clicks a tracked link | Engagement scoring, link analytics |
| `complaint` | A recipient marks a message as spam | Suppress the contact, alert on complaint rates |
| `open` | A recipient opens a message | Engagement tracking |
| `unsubscribe` | A recipient unsubscribes | Sync opt-outs to your CRM or database |

These are the five documented event types. The examples handle all five and log anything else.

## Event Payload Structure

```json
{
  "type": "bounce",
  "brand_id": "0da934ea-f96f-4f2f-85dd-0e8ceb9cba0e",
  "bounce": {
    "date": 1579811821,
    "campaign_id": "9ebe0652-6364-4688-897c-cf2655f988e8",
    "contact_id": "f36999a4-7fc0-4a03-868c-21fad154db1b",
    "email": "test@example.com",
    "type": "hard"
  }
}
```

- `type` is the event type; `bounce.type` is the nested bounce kind (`hard` or `soft`), not the event.
- `click` adds `link_id` and `url`.
- `unsubscribe` adds `unsubscribe_all` (boolean) and `unsubscribe_ids` (array of list IDs).
- `date` is a Unix timestamp in seconds.
- The payloads carry no event ID, so build an idempotency key from fields such as `type`, `contact_id`, `campaign_id`, and `date` (see webhook-handler-patterns).

## Delivery and Retries

BigMailer's webhook documentation does not state a retry schedule, a response timeout, or which status codes count as success. Return a `2xx` quickly and do heavy work asynchronously. Running the endpoint behind Hookdeck gives you retries, replay, and a delivery log regardless.

## Full Event Reference

For the complete list of events and sample payloads, see [BigMailer's webhook documentation](https://docs.bigmailer.io/docs/webhooks-getting-started).
