# Mautic Webhooks Overview

## What Are Mautic Webhooks?

Mautic is an open-source marketing automation platform. Its webhooks send data about Contacts and their activity (form submissions, email opens, page hits, and so on) to a URL you configure, either in real time or in batches.

Delivery mode is a global setting (Configuration → Webhook Settings → Queue Mode):

- **Process Events Immediately** — one request per event, sent as it happens.
- **Queue Events Only - Process Via CLI Command** — events are stored and sent in batches by the Webhooks cron job. Order within a batch is set by "Order of the queued events" (chronological or reverse).

Each request is signed with a `Webhook-Signature` header (see [verification.md](verification.md)).

## Common Event Types

| Event type | Triggered when | Common use cases |
|------------|----------------|------------------|
| `mautic.lead_post_save_new` | Mautic identifies a Contact | Sync new leads to CRM |
| `mautic.lead_post_save_update` | A Contact is updated | Keep external records in sync |
| `mautic.lead_post_delete` | A Contact is deleted | Remove or anonymise external copies |
| `mautic.lead_points_change` | A Contact's points change | Lead scoring alerts |
| `mautic.lead_channel_subscription_changed` | A channel subscription status changes (contactable, bounced, manual, unsubscribed) | Suppression list sync |
| `mautic.lead_company_change` | A Contact is added to or removed from a Company | Account mapping |
| `mautic.company_post_save` | A Company is created or updated | Account sync |
| `mautic.company_post_delete` | A Company is deleted | Account cleanup |
| `mautic.email_on_send` | Mautic sends an Email to a Contact | Delivery logging |
| `mautic.email_on_open` | A Contact presumably opens an Email (tracking pixel; proxies and bots can trigger it) | Engagement tracking |
| `mautic.form_on_submit` | A Contact submits a Form | Create tickets or issues, notify sales |
| `mautic.page_on_hit` | A Contact visits a Landing Page or tracked page | Behaviour tracking |
| `mautic.sms_on_send` | Mautic sends a text message | SMS logging |

## Event Payload Structure

The body is keyed by event type. Each value is an array of event objects, and each event has a `timestamp` (ISO 8601). Queue mode can put several event types, and several events per type, in one request.

```json
{
  "mautic.form_on_submit": [
    {
      "submission": { "id": 7, "form": { "id": 2, "alias": "contact" }, "results": { "email": "a@example.com" } },
      "timestamp": "2026-01-01T12:00:00+00:00"
    }
  ],
  "mautic.lead_post_save_new": [
    { "contact": { "id": 42 }, "timestamp": "2026-01-01T12:00:00+00:00" }
  ]
}
```

Event-specific keys: `contact` (lead events, email/SMS events), `company`, `submission` (form), `hit` (page), `email`, `points` (`old_points`, `new_points`), `channel`/`old_status`/`new_status`, `added` (company change). Delete events carry `id` instead of a full object.

## Full Event Reference

See [Mautic's webhook events and payloads](https://devdocs.mautic.org/en/5.x/webhooks/events/index.html). The docs note this section is awaiting a major update, so compare against a real test payload from your Mautic version.
