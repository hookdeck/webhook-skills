# Loops Webhooks Overview

## What Are Loops Webhooks?

Loops webhooks send data to your application when events happen in your Loops account: contact changes, emails sent, and email engagement and deliverability events. Typical uses: mirror unsubscribes and hard bounces into your own database, log sends against your users, alert on spam reports.

- One endpoint per Loops account, set in [Settings -> Webhooks](https://app.loops.so/settings?page=webhooks). Subscribe to events with the toggles there.
- Signed with `Webhook-Id`, `Webhook-Timestamp` and `Webhook-Signature` headers (see [verification.md](verification.md)).
- Webhooks are available to all Loops users (API changelog, September 29, 2025).

## Common Fields

| Field | Description |
|-------|-------------|
| `eventName` | The event type, e.g. `contact.created` |
| `eventTime` | Unix timestamp (seconds) of when the event occurred in Loops |
| `webhookSchemaVersion` | `1.0.0` for all events |

Depending on the event, the body also contains:

| Object | Contents |
|--------|----------|
| `contactIdentity` | `id`, `email`, `userId` (nullable). Fetch the full contact with the Find a contact endpoint. |
| `contact` | The full contact (`contact.created` only): `id`, `email`, `firstName`, `lastName`, `source`, `subscribed`, `userGroup`, `userId`, `mailingLists` (`{ <listId>: true }`), `optInStatus` (`"accepted"` or `null`), plus custom properties |
| `email` | `id` (this send), `emailMessageId` (the sent version of the campaign, workflow or transactional email), `subject` |
| `mailingList` | `id`, `name`, `description` (nullable), `isPublic` |
| `mailingLists` | A list of `mailingList` objects, when the email went to mailing lists |
| `sourceType` | On `email.*` events: `campaign`, `loop` (workflows) or `transactional` |

To link an `email` back to what you see in the dashboard or API, use the `campaignId`, `loopId` or `transactionalId` in the payload, not `emailMessageId`.

### Workflows Still Use `loop` Names

Loops were renamed to Workflows on May 6, 2026. Webhook payloads keep the old names for compatibility: `loop.email.sent`, `loopId`, `loopName` and `sourceType: "loop"`.

## Event Catalog

### Contacts

| Event | Fired when | Contains |
|-------|------------|----------|
| `contact.created` | A new contact is created in your audience. With double opt-in, only once the contact confirms | `contactIdentity`, `contact` |
| `contact.unsubscribed` | A contact is unsubscribed from your audience, or deleted (alongside `contact.deleted`). Not the same as leaving a mailing list | `contactIdentity` |
| `contact.deleted` | A contact is deleted from your audience | `contactIdentity` |
| `contact.mailingList.subscribed` | A contact is subscribed to a mailing list | `contactIdentity`, `mailingList` |
| `contact.mailingList.unsubscribed` | A contact is unsubscribed from a mailing list | `contactIdentity`, `mailingList` |

With double opt-in enabled, contact webhooks (including `contact.mailingList.subscribed`) fire only after confirmation.

### Email Sending

| Event | Fired when | Contains |
|-------|------------|----------|
| `campaign.email.sent` | A campaign is sent to a contact (1,000 recipients = 1,000 events) | `campaignId`, `campaignName`, `contactIdentity`, `email`, optional `mailingLists` |
| `loop.email.sent` | A workflow email is sent to a contact (one event per contact) | `loopId`, `loopName`, `contactIdentity`, `email`, optional `mailingLists` |
| `transactional.email.sent` | A transactional email is sent | `transactionalId`, `transactionalName`, `contactIdentity`, `email` |

### Email Events

Each contains `sourceType`, the matching `campaignId` / `loopId` / `transactionalId`, `contactIdentity` and `email`.

| Event | Fired when | Transactional? |
|-------|------------|----------------|
| `email.delivered` | An email is delivered to its recipient | Yes |
| `email.softBounced` | An email soft bounces (temporary; it is retried and may still be delivered) | Yes |
| `email.hardBounced` | An email hard bounces (permanent). The contact is unsubscribed, so `contact.unsubscribed` is sent too | Yes |
| `email.opened` | A campaign or workflow email is opened | No (opens aren't tracked) |
| `email.clicked` | A link in a campaign or workflow email is clicked | No (clicks aren't tracked) |
| `email.unsubscribed` | A recipient unsubscribes via the email's "Unsubscribe" link; `contact.unsubscribed` or `contact.mailingList.unsubscribed` is sent too | No |
| `email.resubscribed` | A recipient resubscribes from the email's preference center | No |
| `email.spamReported` | A recipient reports the email as spam | Yes |

### Testing

| Event | Fired when | Contains |
|-------|------------|----------|
| `testing.testEvent` | You send a test request from the Webhooks settings page | `message: "test"` |

```json
{
  "eventName": "testing.testEvent",
  "eventTime": 1734425918,
  "message": "test",
  "webhookSchemaVersion": "1.0.0"
}
```

## Delivery

- At most **10 events per second**; further events are queued.
- Respond within **15 seconds** with a `2xx`. Anything else is retried with exponential backoff: up to **eight attempts** over about **28 hours**, then the event is marked failed.
- If every attempt fails for **5 days**, the endpoint is disabled automatically. Turn it back on in Settings -> Webhooks. Disabling the endpoint also stops in-progress retries.
- The same event can be sent more than once: skip a `Webhook-Id` you've already processed.
- Toggling the endpoint on or off can take a few seconds to reach Loops' servers.
- The **Messages** section of the Webhooks settings page shows 30 days of history (successful, failed, pending, retrying) with your endpoint's responses.

## Full Event Reference

See the [Loops webhooks documentation](https://loops.so/docs/webhooks#event-types) for full example payloads of every event, and the [API changelog](https://loops.so/docs/api-reference/changelog) for webhook field additions.
