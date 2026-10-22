# MailerLite Webhooks Overview

## What Are MailerLite Webhooks?

MailerLite (the new API at `connect.mailerlite.com`, not MailerLite Classic) sends an HTTP POST with a JSON payload to your URL when subscriber or campaign events occur. Webhooks are created and managed through the API, and each one has its own `secret` used to sign deliveries. Webhooks are only delivered for active accounts.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `subscriber.created` | A new subscriber is added | Sync to CRM, send welcome flow |
| `subscriber.updated` | Custom fields change or subscription is confirmed | Keep profile data in sync |
| `subscriber.unsubscribed` | A subscriber becomes unsubscribed | Suppress in other systems |
| `subscriber.added_to_group` | A subscriber is added to a group | Segment-based provisioning |
| `subscriber.removed_from_group` | A subscriber is removed from a group | Revoke access |
| `subscriber.bounced` | An email address bounces | List hygiene |
| `subscriber.automation_triggered` | A subscriber starts an automation | Track funnels |
| `subscriber.automation_completed` | A subscriber finishes an automation | Track funnels |
| `subscriber.spam_reported` | A subscriber marks a campaign as spam | Suppress, alert |
| `subscriber.deleted` | A subscriber is deleted or forgotten (`batchable: true` required) | GDPR erasure sync |
| `subscriber.active` | A subscriber status becomes active | Re-enable sync |
| `campaign.sent` | A campaign is sent | Reporting |
| `campaign.open` | A subscriber opens a campaign (`batchable: true` required) | Engagement analytics |
| `campaign.click` | A subscriber clicks a link (`batchable: true` required) | Engagement analytics |

## Event Payload Structure

There are three shapes. Read the event name from `event` first, then `type`.

**Flat** (`subscriber.created`, `subscriber.updated`, `subscriber.unsubscribed`, `subscriber.bounced`, `subscriber.spam_reported`, `subscriber.active`): the subscriber fields at the top level, plus `event` and `account_id`.

```json
{
  "id": "100000000000000000",
  "email": "john.doe@example.com",
  "status": "active",
  "fields": { "name": "", "last_name": "", "company": "" },
  "subscribed_at": "2024-05-08T08:26:04.000000Z",
  "event": "subscriber.created",
  "account_id": 0
}
```

`campaign.sent` is also flat: `id`, `name`, `total_recipients`, `preview_url`, `date`, `event`, `account_id`.

**Nested** (`subscriber.added_to_group`, `subscriber.removed_from_group`, `subscriber.automation_*`, `subscriber.deleted`, `campaign.open`, `campaign.click`): a `type` field plus `subscriber` and a `group`, `automation` or `campaign` object. `campaign.click` also has `link_url`.

```json
{
  "type": "subscriber.added_to_group",
  "subscriber": { "id": "100000000000000000", "email": "john.doe@example.com" },
  "group": { "id": "100000000000000000", "name": "Group Example" },
  "account_id": 0
}
```

**Batched** (webhooks created with `batchable: true`): the deliveries are bundled.

```json
{
  "events": [
    { "type": "campaign.open", "subscriber": { "email": "john.doe@example.com" }, "campaign": { "name": "Campaign Example" } }
  ],
  "total": 1
}
```

## Delivery

- Respond with 2xx within 3 seconds. Slower responses count as failed.
- On timeout or non-2xx, MailerLite retries three more times, after 10, 100 and 1000 seconds.
- Payloads carry no event ID or timestamp header, so make handlers idempotent on subscriber `id` and the event name.

## Full Event Reference

For the complete list of events and payloads, see [MailerLite's webhook documentation](https://developers.mailerlite.com/docs/webhooks.html).
