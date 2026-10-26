# Belco Webhooks Overview

## What Are Belco Webhooks?

Belco (belco.io) is a customer-service inbox for e-commerce (chat, email, phone). Webhooks notify
your integration in real time about call and conversation activity. Each delivery is an HTTPS
`POST` with a JSON body and an `x-hook-signature` header. Webhooks are created per shop through the
REST API.

## Common Event Types

The event name is the body's top-level `eventName` field. No header names the event.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `call.created` | A call is ringing | Screen pop, log the call |
| `call.queued` | A call was queued | Queue monitoring |
| `call.answered` | A call was answered | Track handling time |
| `call.closed` | A call ended | Call reporting |
| `conversation.created` | A new conversation started | Create a ticket in another system |
| `conversation.replied` | A reply was added | Sync messages |
| `conversation.note.added` | An internal note was added | Sync notes |
| `conversation.assigned` | A conversation was assigned | Notify the assignee |
| `conversation.closed` | A conversation was closed | Close the linked record, send a survey |
| `conversation.reopened` | A conversation was reopened | Reopen the linked record |

## Event Payload Structure

```json
{
  "requestId": "NMbsKcBA64MchrKjQ",
  "eventName": "conversation.created",
  "date": "2025-06-11T09:15:09.159Z",
  "payload": {
    "shopId": "G4ag3eGyiKibrGcM7",
    "conversation": { "_id": "sSzxq7tMBFmCY28o8", "channel": "chat", "status": "open" },
    "conversation_item": { "_id": "rxxtPXZng45rALFjE", "type": "message", "body": "test chat" }
  }
}
```

- `requestId` is unique per event: use it to deduplicate retries.
- `payload.shopId` identifies the shop. Conversation events carry `conversation` and
  `conversation_item`; call events carry `call` (`direction`, `status`, `from`, `to`).

## Delivery

- Respond `200` within 5 seconds.
- Non-2xx responses are retried up to 9 times, the interval growing by 30 seconds each retry.
- 10 consecutive failures within 5 minutes disable the webhook until it is re-enabled in the dashboard.

## Full Event Reference

See [Belco's webhook documentation](https://developers.belco.io/reference/quickstart) and the
[supported events](https://developers.belco.io/reference/supported-events-1) page.
