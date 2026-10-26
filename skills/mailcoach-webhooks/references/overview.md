# Mailcoach Webhooks Overview

## What Are Mailcoach Webhooks?

Mailcoach (email marketing by Spatie, hosted and self-hosted) can send a request to your app whenever something happens in Mailcoach, so you can keep a local database in near-real-time sync. Webhooks are configured on the Webhooks screen in Mailcoach settings and are sent as an HTTP `POST` with a JSON body. Mailcoach sends them with `spatie/laravel-webhook-server`.

The introduction in Mailcoach's docs also mentions tags being added or removed, but the Payloads section documents only the four events below, so only those are covered here.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `UnconfirmedSubscriberCreatedEvent` | A person is added to a list that uses confirmation; not yet confirmed | Show a "pending" state, send your own follow-up |
| `SubscribedEvent` | A subscriber is confirmed | Create or update the user or contact in your database |
| `UnsubscribedEvent` | Someone unsubscribes | Stop marketing sync, update consent flags |
| `CampaignSentEvent` | A campaign has been fully sent | Record the send and its statistics |

The event name is the `event` field in the body (the PHP event class name). No header names the event, so dispatch on it and ignore unknown values.

## Event Payload Structure

Each payload lists `event` first, then the fields flat beside it.

Subscriber events (`UnconfirmedSubscriberCreatedEvent`, `SubscribedEvent`, `UnsubscribedEvent`):

```json
{
  "event": "SubscribedEvent",
  "email_list_uuid": "8d0c2a8e-1c5b-4e0a-9d54-0f9b1b6a7c11",
  "email": "jane@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "extra_attributes": [],
  "tags": ["newsletter"],
  "subscribed_at": "2026-10-26T09:00:00.000000Z",
  "unsubscribed_at": null,
  "created_at": "2026-10-26T08:59:00.000000Z",
  "updated_at": "2026-10-26T09:00:00.000000Z"
}
```

`CampaignSentEvent` fields: `uuid`, `name`, `email_list_uuid`, `email_list`, `template_uuid`, `template`, `from_email`, `from_name`, `status`, `html`, `structured_html`, `email_html`, `webview_html`, `fields`, `utm_tags`, `sent_to_number_of_subscribers`, `segment_class`, `segment_description`, `open_count`, `unique_open_count`, `open_rate`, `click_count`, `unique_click_count`, `click_rate`, `unsubscribe_count`, `unsubscribe_rate`, `bounce_count`, `bounce_rate`, `sent_at`, `statistics_calculated_at`, `scheduled_at`, `summary_mail_sent_at`, `created_at`, `updated_at`.

The docs list field names only; the example values above are illustrative.

## Delivery Notes

- A webhook can be disabled after too many consecutive failures. On self-hosted installs set `maximum_attempts` (for example 5) under `webhooks` in `config/mailcoach.php` and opt in with `disable_failed_webhooks` under `opt_in_features`. Retries do not count toward that limit.
- The docs do not state what counts as success or the retry timing. Respond with a 2xx quickly and process asynchronously.
- There is no delivery or event ID in the documented payload, so deduplicate on your own key (for example `email_list_uuid` plus `email` plus the event name and timestamp).
- Mailcoach can keep a log of webhook calls (`webhooks.logs` in `config/mailcoach.php`, then publish and run the migrations), and you can choose which event types a webhook receives on its details page.

## Full Reference

See [Mailcoach's webhook documentation](https://www.mailcoach.app/resources/learn-mailcoach/advanced/webhooks/).
