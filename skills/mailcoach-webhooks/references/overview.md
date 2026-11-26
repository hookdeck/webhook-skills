# Mailcoach Webhooks Overview

## What Are Mailcoach Webhooks?

Mailcoach (email marketing by Spatie) notifies your application when something changes in Mailcoach. It sends an HTTP `POST` with a JSON body to your HTTPS receiver. These are different from provider feedback sent *to* Mailcoach, and from the Webhook trigger that starts an automation.

## Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `SubscribedEvent` | A subscription becomes confirmed | Create or update the contact in your database |
| `ResubscribedEvent` | A previously unsubscribed address subscribes again | Restore marketing consent |
| `UnconfirmedSubscriberCreatedEvent` | A new address awaits confirmation | Show a "pending" state; don't treat it as permission to send |
| `UnsubscribedEvent` | Someone unsubscribes | Update consent flags |
| `TagAddedEvent` | A tag is added to a subscriber (`added_tag`) | Sync segments or CRM fields |
| `TagRemovedEvent` | A tag is removed from a subscriber (`removed_tag`) | Sync segments or CRM fields |
| `CampaignSentEvent` | Mailcoach marks a campaign as sent | Record the send; fetch final statistics later |
| `ContentOpenedEvent` | A campaign email is opened | Engagement tracking |
| `LinkClickedEvent` | A link in an email is clicked | Engagement tracking |
| `BounceRegisteredEvent` | A permanent delivery failure is recorded | Flag the address |
| `SoftBounceRegisteredEvent` | A temporary delivery failure is recorded | Watch for repeats |

The event name is the top-level `event` field. No header names the event, so dispatch on it and ignore unknown values. The `text` field, when present, is a human-readable summary, not an identifier.

## Event Payload Structure

Fields are top-level, not wrapped in `data`. UUIDs are strings, absent timestamps and names may be `null`, and timestamps are JSON date strings.

Subscriber events use the subscriber resource. Mailcoach's `SubscribedEvent` example (email and first name replaced with placeholders):

```json
{
  "event": "SubscribedEvent",
  "uuid": "2051c60c-a9f3-31d0-a58c-7adcc32ea2e3",
  "email_list_uuid": "a69075c6-ff5c-4b6a-b217-12026cb72e4f",
  "email": "user1@example.com",
  "first_name": "Example",
  "last_name": null,
  "extra_attributes": {},
  "tags": [],
  "subscribed_at": "2026-11-18T10:00:00.000000Z",
  "unsubscribed_at": null,
  "created_at": "2026-11-18T09:59:00.000000Z",
  "updated_at": "2026-11-18T10:00:00.000000Z",
  "text": "Email user1@example.com subscribed to list Newsletter"
}
```

`TagAddedEvent` and `TagRemovedEvent` add `added_tag` or `removed_tag`, a string with the tag name.

`CampaignSentEvent` is the campaign resource flattened at the top level, plus `event` and `text`. Its `uuid` identifies the campaign, not an individual send. It includes the content and statistics, so don't log it publicly.

`ContentOpenedEvent` currently covers campaign opens and carries `open_uuid`, `send_uuid`, `model_uuid`, `model_type`, `subscriber_uuid`, `subscriber_email` and `opened_at`. `model_type` is the installation's morph-class value, so don't hard-code a guessed class name. `LinkClickedEvent` carries `send_uuid`, `click_uuid`, `link_uuid`, `email_list_uuid`, `subscriber_uuid`, `subscriber_email` and `clicked_at`; use `link_uuid` with the Links API to get the URL. Automated scanners can produce opens and clicks.

The bounce events carry `send_uuid`, `subscriber_uuid`, `subscriber_email` and `email_list_uuid`.

## Delivery Notes

- Return a 2xx after accepting the event durably. A request times out after 10 seconds.
- A failed delivery gets at most five attempts in total, retried after 10, 100, 1,000 and 10,000 seconds (queue scheduling can add delay).
- Hosted Mailcoach disables a webhook after five consecutive calls exhaust their attempts. A successful call resets the count. Re-enabling it doesn't replay missed events; reconcile through the Subscribers API.
- Event order and exactly-once delivery aren't guaranteed. Use `click_uuid` or `open_uuid` where present as part of a dedupe key, together with the event name; subscriber changes need your own key or a state check. Don't dedupe all future events on the subscriber UUID alone.
- Inspect **Webhook logs** on the webhook's details page.

## Full Reference

See [Mailcoach's webhook documentation](https://www.mailcoach.app/docs/advanced/webhooks/).
