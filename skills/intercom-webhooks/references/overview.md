# Intercom Webhooks Overview

## What Are Intercom Webhooks?

Intercom is a customer messaging platform. Intercom webhooks (called **notifications**)
let your app react to events that happen in a workspace — new conversations, replies,
contact updates, tickets, and more — without polling the REST API.

You subscribe to **topics** in the Intercom Developer Hub. When a matching event
occurs, Intercom POSTs a JSON payload to your endpoint. Each request is signed
with HMAC-SHA1 so you can verify it originated from Intercom.

## Common Topics

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ping` | You save a webhook in the Developer Hub | Endpoint handshake / health check |
| `conversation.user.created` | A user starts a new conversation | Auto-acknowledge, route to a team |
| `conversation.user.replied` | A user replies in an existing conversation | Re-open tickets, alert on-call |
| `conversation.admin.replied` | A teammate (admin) replies | Sync replies to a CRM |
| `conversation.admin.assigned` | A conversation is assigned to an admin | Load balancing, SLA tracking |
| `conversation.admin.closed` | An admin closes a conversation | Trigger CSAT surveys |
| `conversation.admin.noted` | An admin adds a private note | Internal tooling, escalation |
| `contact.user.created` | A new user contact is created | Sync to CRM / data warehouse |
| `contact.lead.created` | A new lead contact is created | Marketing automation |
| `contact.user.tag.created` | A tag is applied to a user | Segment-based workflows |
| `ticket.created` | A new ticket is created | Mirror into your ticketing system |
| `ticket.admin.assigned` | A ticket is assigned to an admin | Notifications, SLA timers |
| `ticket.state.updated` | A ticket transitions state | Workflow automation |

## Notification Payload Structure

All Intercom notifications share the same envelope:

```json
{
  "type": "notification_event",
  "app_id": "abc123",
  "data": {
    "type": "notification_event_data",
    "item": {
      "type": "conversation",
      "id": "12345",
      "...": "..."
    }
  },
  "links": {},
  "id": "notif_01HABCDEFG",
  "topic": "conversation.user.created",
  "delivery_status": "pending",
  "delivery_attempts": 1,
  "delivered_at": 0,
  "first_sent_at": 1700000000,
  "created_at": 1700000000
}
```

Key fields:

| Field | Description |
|-------|-------------|
| `id` | Unique notification ID — use for idempotency keys |
| `topic` | The event name (e.g. `conversation.user.created`) |
| `data.item` | The resource (conversation, contact, ticket, etc.) |
| `app_id` | The Intercom workspace ID that produced the event |
| `delivery_attempts` | How many times this notification has been attempted |

## Important Headers

| Header | Description |
|--------|-------------|
| `X-Hub-Signature` | `sha1=<hex>` HMAC-SHA1 signature of the raw body |
| `X-Body-Signature` | (Some accounts) alternate name for the same value |
| `Content-Type` | Always `application/json` |
| `User-Agent` | Identifies Intercom as the sender |

## The `ping` Handshake

When you create or update a webhook in the Developer Hub, Intercom sends a `ping`
notification to verify the endpoint. Your handler must respond with `2xx` for the
webhook to be saved. The `ping` payload follows the same envelope as other
notifications and is still signed — verify it normally.

## Delivery and Retries

- Intercom retries failed deliveries multiple times with backoff.
- Respond with `2xx` quickly (under 5 seconds). Do heavy work async.
- Use `notification.id` as your idempotency key — Intercom may retry on transient
  failures, so the same event can arrive more than once.

## Full Event Reference

For the complete list of topics and payloads, see:
- [Intercom Webhooks Overview](https://developers.intercom.com/docs/webhooks)
- [Webhook Topics & Models](https://developers.intercom.com/docs/references/webhooks/webhook-models)
