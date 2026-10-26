# Aimfox Webhooks Overview

## What Are Aimfox Webhooks?

Aimfox is a LinkedIn automation platform. Workspace webhooks (beta) push an HTTP `POST` with a JSON
body to your endpoint when events happen in the workspace, so you don't have to poll the API. You
can configure several webhooks and pick which events each one receives.

Webhooks are not signed. The only authentication is the optional **Authentication Header** on the
webhook, sent with every request. See [verification.md](verification.md).

## Common Event Types

| Event (`event_type`) | Triggered When | Common Use Cases |
|----------------------|----------------|------------------|
| `new_connection` | A new LinkedIn connection is detected on a workspace account | Create a CRM contact |
| `accepted` | A campaign connection request is accepted | Start a follow-up sequence |
| `new_reply` | A reply arrives to any LinkedIn message on a workspace account | Notify sales, update a lead |
| `message` | A campaign sends a message | Activity logging |
| `account_logged_out` | A workspace account is logged out (manually or session expiry) | Alert someone to re-authenticate |

## All Event Types

`account_logged_in`, `account_logged_out`, `new_connection`, `view`, `connect`, `accepted`,
`inmail`, `message`, `new_reply`, `reply`, `inmail_reply`, `lead_label_added`, `campaign_ended`,
`campaign_created`, `campaign_started`, `inbox_event`, `campaign_reply`.

`reply` fires on a lead's first reply to a campaign message, `campaign_reply` on any reply to a
campaign message, and `new_reply` on any reply to any message on a workspace account.

## Event Payload Structure

```json
{
  "id": "b82dce4c-34ef-4d08-875b-bf53a7432661",
  "event_type": "account_logged_in",
  "event": { "...": "fields depend on event_type" },
  "workspace": { "id": "47973863-...", "name": "Aimfox Workspace", "created_at": 1732541078 }
}
```

- `id`: unique event identifier (use it to de-duplicate retries)
- `event_type`: one of the types above
- `workspace`: details of your workspace
- `event`: event-specific object

## Retries

A failed delivery is retried up to 6 times: after 1 minute, then 5 minutes, 30 minutes, 1 hour,
6 hours and 1 day after the previous attempt. Return `2xx` quickly and de-duplicate on `id`.

## Full Event Reference

See [Aimfox webhook documentation](https://docs.aimfox.com/#/webhook-docs) for example payloads of
every event.
