# Travtus Webhooks Overview

## What Are Travtus Webhooks?

[Travtus](https://travtus.com/) is the "Adam" AI assistant platform for residential property
management. It sends an HTTPS `POST` with a signed JSON body to your endpoint when a lease or
task changes, and when its AI has a reply ready for a message you sent through the Messaging API
(SMS, email, web chat). Deliveries go through Svix and follow Standard Webhooks with the `svix-*`
header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` within 15 seconds |
| Retries | Immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, then 10 h again |
| Disabled endpoints | An endpoint failing for 5 days is disabled and an `EndpointDisabledEvent` is sent |
| Delivery | At-least-once; `svix-id` is stable across retries |

## Event Payload Structure

Every event uses the same envelope:

```json
{
  "event_type": "task.update",
  "message_id": "51d155b3-496f-434e-b664-406836be35a0",
  "body": {
    "identifier": "26d2f5f9-b128-48cd-add8-303e067df958",
    "title": "a title",
    "status": "in_progress",
    "importance": "very_high",
    "creator": { "email": "support@travtus.com", "first_name": "Bob", "last_name": "James" }
  }
}
```

- `event_type` is the event name.
- `message_id` is the Svix-assigned message ID. Don't confuse it with `body.message_id` on
  Messaging API replies, which is the original message's identifier.
- `body` is the lease, the task (with a `creator` object) or the AI reply.
- Deduplicate on the `svix-id` header (stable across retries).

## Common Event Types

| Event | Triggered When | `body` fields |
|-------|----------------|---------------|
| `lease.update` | A lease is created or updated | `identifier`, `start_date`, `end_date`, `move_in_date`, `rent`, `deposit`, `notice_given`, `notice_date`, `move_out_date_requested` |
| `task.create` | A task is created | `identifier`, `external_ref`, `title`, `summary`, `category`, `topic`, `importance`, `status`, `queue_name`, `due_datetime`, `creator`, and more |
| `task.update` | A task is updated | same as `task.create` |
| `task.delete` | A task is deleted | same as `task.create` (`status` is `deleted`) |
| `sms.respond` | AI response to an SMS message | `message_id`, `conversation_id`, `sender_name`, `message_text`, `channel`, `company_id`, `human_handover_ind`, `portfolio_external_ref` |
| `email.respond` | AI response to an email message | same as `sms.respond` |
| `web_chat.respond` | AI response to a web chat message | same as `sms.respond` |

7 events are documented; the list may not be exhaustive. The examples handle exactly these and
acknowledge anything else with `200`.

Task `status` is one of `created`, `in_progress`, `completed`, `deleted`. Task `importance` is
`low`, `normal`, `high` or `very_high`. For Messaging API replies `channel` is `sms`, `email` or
`website`, and `human_handover_ind` is `true` when Travtus suggests handing over to a human.

## Delivery Notes

- Respond within 15 seconds. Acknowledge quickly and do the work on a queue.
- Disable CSRF protection on the webhook route if your framework enables it by default.
- If you subscribe to no event types in the portal, the endpoint receives all events.
- Failed messages can be retried one at a time, or in bulk from a date, in the portal.
- Nothing in the docs describes a challenge or validation request when an endpoint is added.

## Full Event Reference

See Travtus's [lease events](https://docs.travtus.com/travtus-api-and-webhook/data-types-and-endpoints/lease/webhooks),
[task events](https://docs.travtus.com/travtus-api-and-webhook/data-types-and-endpoints/task/webhooks)
and [Messaging API webhooks](https://docs.travtus.com/travtus-api-and-webhook/data-types-and-endpoints/messaging/messaging-webhook)
pages, and the [webhook guide](https://docs.travtus.com/travtus-api-and-webhook/webhook/getting-started-with-webhook-events).
