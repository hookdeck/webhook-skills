# GREEN-API Webhooks Overview

## What Are GREEN-API Webhooks?

GREEN-API is a WhatsApp API gateway: you link a WhatsApp account to a GREEN-API
**instance** and send and receive messages over HTTP. Incoming notifications can
be read by polling (the HTTP API technology) or pushed to your server by the
**Webhook Endpoint** technology, which this skill covers.

With Webhook Endpoint, the GREEN-API server sends an HTTP `POST` with a JSON body
(`Content-Type: application/json`) to the instance's `webhookUrl` for each
notification. Delivery facts from the docs:

- Failed deliveries are retried at **1-minute intervals**; delivery is
  guaranteed within **24 hours**.
- Throughput is about **50 notifications per second** (20 ms per webhook).
- Which notification types you receive is controlled per instance
  (`incomingWebhook`, `outgoingWebhook`, `outgoingAPIMessageWebhook`,
  `stateWebhook`, ...). See [setup.md](setup.md).

## Common Event Types

The type is in the body's `typeWebhook` field:

| `typeWebhook` | Triggered When | Common Use Cases |
|---------------|----------------|------------------|
| `incomingMessageReceived` | A message or file arrives on the instance | Chatbots, support inboxes, auto-replies |
| `outgoingMessageReceived` | A message is sent from the linked phone | Syncing conversations sent outside your app |
| `outgoingAPIMessageReceived` | A message is sent via the API | Logging/auditing API sends |
| `outgoingMessageStatus` | A sent message changes status | Delivery/read receipts, retrying `failed` sends |
| `stateInstanceChanged` | The instance authorization state changes | Alerting when an instance is `notAuthorized` or `blocked` |
| `statusInstanceChanged` | The instance socket state changes | Monitoring `online` / `offline` |
| `incomingCall` | A call comes in | Missed-call auto-replies |

Other documented types: `outgoingCall`, `deviceInfo`, `incomingBlock`,
`quotaExceeded`, `IncomingMessageStatus`.

## Event Payload Structure

Every notification has `typeWebhook`, `instanceData`, and `timestamp` (Unix
seconds). Type-specific fields follow.

`incomingMessageReceived` (text message):

```json
{
  "typeWebhook": "incomingMessageReceived",
  "instanceData": { "idInstance": 7103000000, "wid": "79876543210@c.us", "typeInstance": "whatsapp" },
  "timestamp": 1588091580,
  "idMessage": "F7AEC1B7086ECDC7E6E45923F5EDB825",
  "senderData": {
    "chatId": "79001234567@c.us",
    "sender": "79001234567@c.us",
    "chatName": "John",
    "senderName": "John",
    "senderContactName": "John Doe"
  },
  "messageData": {
    "typeMessage": "textMessage",
    "textMessageData": { "textMessage": "I use Green-API to send this message to you!" }
  }
}
```

`outgoingMessageStatus`:

```json
{
  "typeWebhook": "outgoingMessageStatus",
  "chatId": "79001234567@c.us",
  "instanceData": { "idInstance": 7103000000, "wid": "79876543210@c.us", "typeInstance": "whatsapp" },
  "timestamp": 1727691478,
  "idMessage": "3EB0608D6A2901063D63",
  "status": "sent",
  "sendByApi": true
}
```

`status` values: `sent`, `delivered`, `read`, `failed`, `noAccount`,
`notInGroup`, `suspended` (`yellowCard` is deprecated). `failed` and
`noAccount` can't be disabled, so always handle them.

`stateInstanceChanged`:

```json
{
  "typeWebhook": "stateInstanceChanged",
  "instanceData": { "idInstance": 1, "wid": "", "typeInstance": "whatsapp" },
  "timestamp": 1586700690,
  "stateInstance": "notAuthorized"
}
```

`stateInstance` values: `notAuthorized`, `authorized`, `blocked`, `starting`,
`suspended` (`sleepMode` and `yellowCard` are deprecated).

Notifications have no delivery ID header. For deduplication, use `idMessage` for
message and status notifications (plus `status` for status updates), and
`typeWebhook` + `instanceData.idInstance` + `timestamp` for the rest.

## Full Event Reference

- [Incoming webhook types](https://green-api.com/en/docs/api/receiving/notifications-format/type-webhook/)
- [Incoming notifications format](https://green-api.com/en/docs/api/receiving/notifications-format/)
- [Webhook Endpoint technology](https://green-api.com/en/docs/api/receiving/technology-webhook-endpoint/)
