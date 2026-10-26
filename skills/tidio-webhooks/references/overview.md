# Tidio Webhooks Overview

## What Are Tidio Webhooks?

Tidio (tidio.com) is a customer-service platform with live chat, Lyro AI chatbots, and
ticketing. Webhooks notify your endpoint when contacts, conversations, tickets, or
satisfaction ratings change. They are available on the **Plus and Premium** plans and are
configured under **Settings > Developer > Webhooks**.

Changes made through the Tidio OpenAPI do **not** trigger webhooks (this prevents event
loops), e.g. importing contacts via the API does not send `contact.created`.

## Request Format

Webhooks are HTTP `POST` requests with these headers:

| Header | Value |
|--------|-------|
| `content-type` | `application/json` |
| `user-agent` | `Tidio Webhook` |
| `x-tidio-signature` | `t=<unix seconds>,s=<hex>[,s=<hex>...]` |

## Event Payload Structure

Every body has the same envelope; `content` holds the topic-specific data.

```json
{
  "created_at": 1687177445,
  "project_public_key": "m8ixolegtgfvo6ckzvmuempdq0obbqsy",
  "topic": "contact.created",
  "version": 1,
  "webhook_id": "7307ac4d-2c74-4d32-b7f9-f7d037ed2ebb",
  "content": { "id": "147ae37d-43bc-42a6-bc7b-c10d1525a2f7", "email": "john@example.com" }
}
```

| Field | Description |
|-------|-------------|
| `created_at` | Unix timestamp when the webhook was sent (use it to order events) |
| `project_public_key` | Public key of your Tidio project |
| `topic` | Event name (dispatch on this) |
| `version` | Webhook version |
| `webhook_id` | Unique UUID (dedupe on this) |
| `content` | Topic-specific object |

## Common Event Types

| Event (`topic`) | Triggered When | Key `content` fields |
|-----------------|----------------|----------------------|
| `contact.created` | A contact is created | `id`, `email`, `phone`, `first_name`, `last_name`, `distinct_id`, `properties` |
| `contact.updated` | A contact is updated | same as `contact.created` |
| `conversation.solved_by_operator` | An operator clicks "Mark as Solved" | `contact_id`, `solved_at` |
| `conversation.solved_by_lyro` | Lyro considers the conversation finished | `contact_id`, `solved_at`, `reason` (`handoff`, `taken_over_by_operator`, `inactive`) |
| `conversation.solved_automatically` | The Automatic Solve feature resolves it (needs configuration) | `contact_id`, `solved_at` |
| `conversation.operator_replied` | An operator message is persisted on the chat channel (visitor messages are not emitted) | `contact_id`, `message` (`id`, `operator_id`, `operator_name`, `message`, `created_at`) |
| `ticket.created` | A ticket is created | `id`, `link`, `status`, `subject`, `messages`, `priority`, `contact_id`, `assigned_operator_id` |
| `ticket.status_updated` | A ticket's status changes (e.g. open to solved) | ticket fields as above |
| `ticket.operator_assigned` | A new operator is assigned to a ticket | ticket fields as above |
| `ticket.operator_replied` | An operator replies to a ticket | ticket fields as above |
| `ticket.contact_replied` | A contact replies to a ticket | ticket fields as above |
| `ticket.internal_note_added` | An internal note is added to a ticket | ticket fields as above |
| `ticket.replied` | ANY reply is added (operator, contact, or note); `content` has exactly one message | ticket fields, one `messages` entry with `author_type` |
| `ticket.holder_changed` | The ticket holder changes (`operator`, `ai_assistant`; more may be added) | `ticket_id`, `new_holder`, `previous_holder`, `contact_id` |
| `customer_satisfaction.rated` | A satisfaction survey is submitted | `date`, `type` (`operator` or `ai_assistant`), `score` (1-5), `source` (`conversations` or `tickets`), `email`, `comment` |

The example handlers act on `contact.created`, `contact.updated`, `conversation.solved_by_operator`,
`conversation.solved_by_lyro`, `conversation.solved_automatically`, `ticket.created`,
`ticket.status_updated`, `ticket.replied`, and `customer_satisfaction.rated`, and log every other topic.

## Delivery

- Respond `2xx` within **4 seconds**; process asynchronously.
- Any non-2xx response, timeout, or connection error is retried 9 times: 5 s, 10 s, 30 s,
  1 min, 3 min, 10 min, 30 min, 1 h, 3 h (about 4 h 45 min in all).
- **No ordering guarantee**: order by `created_at`.
- **Duplicates are possible**: store processed `webhook_id` values and skip repeats.

## Full Event Reference

For the complete list of events and payloads, see [Tidio's events reference](https://developers.tidio.com/reference/events)
and the [webhooks introduction](https://developers.tidio.com/docs/webhooks-introduction).
