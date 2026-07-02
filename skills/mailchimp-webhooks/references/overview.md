# Mailchimp Webhooks Overview

## What Are Mailchimp Webhooks?

Mailchimp webhooks notify your application when things change in a Mailchimp
audience (list) — a contact subscribes or unsubscribes, updates their profile,
changes their email address, gets cleaned, or a campaign finishes sending.
Mailchimp sends an HTTP `POST` to a URL you register per audience.

Unlike most providers, **Mailchimp does not sign its webhooks**. There is no
HMAC and no signature header. See [verification.md](verification.md) for how to
secure the endpoint instead.

## How Delivery Works

- **URL validation (GET):** When you save a webhook in Mailchimp, it first sends
  a `GET` request to the URL to confirm it responds. Your endpoint must return
  `200` for the GET or Mailchimp will refuse to save the webhook.
- **Event delivery (POST):** Events are delivered as `POST` requests with a
  `Content-Type` of `application/x-www-form-urlencoded`.
- **Timeout:** If the URL is unavailable or takes more than ~10 seconds to
  respond, Mailchimp cancels the request.

## Common Event Types

Every payload has a top-level `type` field. Dispatch on it.

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `subscribe` | A contact joins the audience | Sync new contacts to your CRM/DB |
| `unsubscribe` | A contact leaves the audience | Suppress a contact, update marketing consent |
| `profile` | A contact updates their profile / merge fields | Keep contact data in sync |
| `upemail` | A contact changes their email address | Re-key the contact in your DB |
| `cleaned` | An address is cleaned (hard bounce / spam) | Mark an address undeliverable |
| `campaign` | A campaign finishes sending | Trigger post-send reporting/automation |

## Event Payload Structure

Payloads are form-encoded. Keys use bracket notation for nested data, e.g.
`data[merges][FNAME]`. After parsing, a subscribe event looks like:

```
type=subscribe
fired_at=2026-07-02 21:35:57
data[id]=8a25ff1d98
data[list_id]=a6b5da1054
data[email]=api@example.com
data[email_type]=html
data[merges][EMAIL]=api@example.com
data[merges][FNAME]=Example
data[merges][LNAME]=User
data[ip_opt]=10.20.10.30
data[ip_signup]=10.20.10.30
```

Parsed into a nested object it becomes:

```json
{
  "type": "subscribe",
  "fired_at": "2026-07-02 21:35:57",
  "data": {
    "id": "8a25ff1d98",
    "list_id": "a6b5da1054",
    "email": "api@example.com",
    "email_type": "html",
    "merges": { "EMAIL": "api@example.com", "FNAME": "Example", "LNAME": "User" },
    "ip_opt": "10.20.10.30",
    "ip_signup": "10.20.10.30"
  }
}
```

### Field notes per type

- **subscribe / profile:** `id`, `list_id`, `email`, `email_type`, `merges`, `ip_opt` (subscribe also has `ip_signup`).
- **unsubscribe:** adds `action` (`unsub` or `delete`) and `reason` (`manual` or `abuse`), plus `campaign_id` when triggered from a campaign.
- **upemail:** `list_id`, `new_id`, `new_email`, `old_email` (no `merges`).
- **cleaned:** `list_id`, `campaign_id`, `reason` (`hard` or `abuse`), `email`.
- **campaign:** `id` (campaign id), `subject`, `status`, `reason`, `list_id`.

## Full Event Reference

See Mailchimp's [Sync audience data with webhooks](https://mailchimp.com/developer/marketing/guides/sync-audience-data-webhooks/) guide for the complete, authoritative reference.
