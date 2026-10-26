# Tokity Webhooks Overview

## What Are Tokity Webhooks?

Tokity (tokity.com, formerly DeskDirector) provides client and tech portals on top of PSA
ticketing systems such as ConnectWise and Autotask. It offers two ways to be notified when a
ticket changes:

| | Webhooks | Events |
|---|----------|--------|
| Setup | Admin Portal > Advanced > Webhook | Admin Portal event editor (or indirectly via the Power Automate connector) |
| Filtering | Choose the ticket change types to subscribe to; filter the rest yourself | Trigger + conditions (queue, priority, tags...) + one or more actions |
| Payload | Ticket plus `from` (previous state) | Simpler: no `from`, because Tokity filtered on state first |
| History | None | 28-day run history with per-action delivery results |
| Limit | None documented | 100 events per tenant |

Tokity recommends Events where you have access to them. **Both sign every request** with
HMAC-SHA256 in the `x-dd-signature` header, using a secret unique to that webhook or event.

## There Is No Event Name

Unlike most providers, a Tokity request does not carry an event type in a header or a body field.
The change types are chosen when you register the webhook. Subscribe narrowly (for example
"Comment added") and treat the endpoint as meaning that, or subscribe broadly ("Ticket updated")
and diff the body.

## Ticket Webhook Payload

The body is the ticket plus a `from` property holding the ticket's previous state:

- `from` is `null`: the ticket did not exist before, so this is a ticket-created delivery.
- `from` is an object: diff it against the current ticket data to see what changed.
- The body is wrapped in an array for historical reasons (batching was planned). Expect one item
  per call, but loop over the array anyway.

An Events action sends the ticket without `from`. The exact schema and a live example are shown in
the Admin Portal when you register a webhook (the **Payload Sample** tab).

## Ticket Change Types

Subscribe a ticket webhook to any of these: Ticket created, Status changed, Ticket updated
(generic: fires on any ticket change), Comment added, Ticket closed, Ticket re-opened, Time entry
added, Approval required, Approval granted, More info requested, Ticket survey response received,
Ticket tags updated, Ticket survey triggered.

## Chat Session Payload

A chat webhook body is an array of chat sessions, one per change. Fields from Tokity's docs:

| Field | Meaning |
|-------|---------|
| `id`, `name` | Session id and name |
| `status` | `created`, `handled` (by a technician), `missed` (user left unanswered), `callback` (user left a callback request) or `completed` |
| `pastStatus` | List of earlier statuses |
| `type` | `request` (from the end user, in a portal) or `push` (started by an agent in the TECH Portal) |
| `reference` | If the chat is about a ticket: `{ "type": "ticket", "id": "<ticket id>" }` |
| `creator` | Who created the session (a member or a contact) |
| `targetUsers`, `users`, `participants` | Invited users, users currently in the chat, everyone who ever joined |
| `createdDateTime`, `lastModifiedDateTime` | Timestamps |

```json
[
  {
    "msp": "dd",
    "id": "1586985009-627B",
    "name": "Test",
    "type": "request",
    "status": "handled",
    "pastStatus": ["created", "handled"],
    "reference": { "type": "ticket", "id": "22282" },
    "creator": { "entityId": 106, "name": "Jason He", "userId": "dd~c~106" },
    "users": [],
    "lastModifiedDateTime": "2020-04-15T21:12:00.9897216Z"
  }
]
```

## Labels Used in the Examples

The example handlers classify each array item as `chat` (has a string `status` and a
`pastStatus` array) or `ticket_change` (anything else). These are this skill's labels, not
names from Tokity.

## Delivery

Tokity's docs do not document retries, the delivery timeout or the response codes treated as
success. Respond with `200` quickly and make handlers idempotent.

## Full Reference

- [Webhooks](https://help.tokity.com/article/3rd0in4l3g-webhooks)
- [Webhooks vs. Events](https://help.tokity.com/article/1e1w8rvqmi-data-sync-notifications)
- [Verifying Webhook and Event Payloads (HMAC Signature)](https://help.tokity.com/article/5ya327c2uj)
