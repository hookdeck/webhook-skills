# Help Scout Webhooks Overview

## What Are Help Scout Webhooks?

Help Scout calls a URL on your server when events happen in your workspace (conversations, customers, ratings, Beacon chats, tags, organizations, users). Each request is a `POST` with a JSON body in the object format for that event (the v2 Conversation, Customer, Rating, Tag, and similar objects). Webhooks are configured in the UI under Workspace > Apps > Webhooks.

Every request carries two Help Scout headers:

| Header | Purpose |
|--------|---------|
| `X-HelpScout-Event` | The event name, for example `convo.created` |
| `X-HelpScout-Signature` | Base64 HMAC-SHA1 of the raw body, keyed with your secret key |

The event name is only in the header, so route on `X-HelpScout-Event`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `convo.created` | A conversation is created | Create a ticket in another system, alert a channel |
| `convo.assigned` | A conversation is assigned | Notify the assignee, update routing dashboards |
| `convo.status` | A conversation status changes | Sync status, trigger follow-up on close |
| `convo.customer.reply.created` | A customer replies | Escalate, reopen external tasks |
| `convo.agent.reply.created` | An agent replies (user-generated threads only, not auto replies) | Response-time metrics |
| `customer.created` | A customer is created (global, not filterable by inbox) | CRM sync |
| `customer.updated` | A customer is updated | Keep profiles in sync |
| `satisfaction.ratings` | A satisfaction rating is received | CSAT reporting, low-score alerts |

## All Event Names

- Conversations: `convo.assigned`, `convo.created`, `convo.ai-answers.created`, `convo.deleted`, `convo.merged`, `convo.moved`, `convo.status`, `convo.tags`, `convo.custom-fields`, `convo.customer.reply.created`, `convo.agent.reply.created`, `convo.note.created`
- Customers: `customer.created`, `customer.updated`, `customer.deleted`
- Ratings: `satisfaction.ratings`
- Beacon chat: `beacon.chat.created`, `beacon.chat.customer.replied`, `beacon.chat.agent.replied`, `beacon.chat.assigned`, `beacon.chat.ended`
- Tags: `tag.created`, `tag.updated`, `tag.deleted`
- Surveys: `message.survey.response.received`
- Organizations: `organization.created`, `organization.updated`, `organization.deleted`
- Users: `user.status.changed`

Delete events (`convo.deleted`, `customer.deleted`, `tag.deleted`, `organization.deleted`) send only `{ "id": ... }`.

## Delivery and Retries

- Any **2xx** response is success. The response body is discarded.
- **410** deactivates and deletes the webhook. Never return it by accident.
- Any other status is a failure. Failed events are retried up to **10 times** with an increasing delay, then discarded.
- A webhook is automatically deactivated once ten or more events have been discarded.

Retries and duplicates are possible, so make handlers idempotent.

## Full Event Reference

See [Help Scout's webhook documentation](https://developer.helpscout.com/webhooks/).
