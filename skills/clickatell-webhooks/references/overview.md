# Clickatell Webhooks Overview

## What Are Clickatell One API Callbacks?

Clickatell's One API (WhatsApp and SMS) sends HTTPS `POST` callbacks with a JSON body to URLs you
configure on the integration:

- a **status callback URL** for delivery and status events
- a **reply callback URL** for inbound (mobile-originated, `mo`) messages

Splitting them keeps conversational latency low. Callbacks are **not signed**. The only
authentication is a Custom Security Header you add to the callback URL (see
[setup.md](setup.md) and [verification.md](verification.md)).

Hookdeck's Clickatell source covers One API callbacks only; Basic Auth alone and legacy SMS
Gateway callbacks are not covered.

## Common Event Types

The event kind is the name of the key inside `event`. Each value is an array of events.

| Event | Callback | Triggered When | Common Use Cases |
|-------|----------|----------------|------------------|
| `messageStatusUpdate` | Status | A message's status changes (`status`, `statusCode`) | Track delivery, mark messages read |
| `messageFallback` | Status | A message falls back to another channel | Log fallback, adjust routing |
| `statusIsTyping` | Status | The user is typing | Show a typing indicator |
| `moText` | Reply | An inbound text message | Chatbots, support inboxes |
| `moMedia` | Reply | An inbound image, file or other media | Store attachments |
| `moLocation` | Reply | An inbound location | Dispatch, store lookup |
| `moContacts` | Reply | Inbound contact cards | Import contacts |
| `moSuggestedResponse` | Reply | A suggested-reply button is tapped (`postbackData`) | Continue a flow |
| `moListPickerResponse` | Reply | A list item is selected (`selectedItems`) | Continue a flow |
| `moButtonResponse` | Reply | A button is tapped (`selectedItem`) | Continue a flow |

## Event Payload Structure

```json
{
  "integrationId": "fa8090815f05d5ed015f0b5b56080cd2",
  "integrationName": "My integration",
  "event": {
    "messageStatusUpdate": [
      {
        "channel": "whatsapp",
        "timestamp": 1506607698860,
        "statusCode": 5,
        "status": "DEVICE_ACK",
        "messageId": "3a89680503414383af44dcd0e4e5f184",
        "clientMessageId": "2993b6b548000a80989a20549e7558a5"
      }
    ]
  }
}
```

Reply events (`moText` and friends) carry `channel`, `messageId`, `relatedMessageId`,
`relatedClientMessageId`, `from`, `to` and `timestamp`, plus content fields such as `content`
(text), `contentType`/`files` (media) or `postbackData` (button replies), and a `whatsapp` or
`sms` object with channel details. `moLocation` events spell the latitude field `latitute` in
Clickatell's docs.

## Delivery Behavior

- Any HTTP 2xx response acknowledges the callback. Anything else is retried (redirects are not followed).
- Retries mean **duplicate callbacks**: deduplicate on `messageId` (plus `status` for status events).
- Events can arrive **out of order**: use `timestamp` (milliseconds) to order them.
- Batch size is currently always 1, but one request may carry several events in future: loop over
  the arrays.
- New event kinds and fields are added over time: ignore what you don't handle, and acknowledge it.
- Status and reply callbacks have different payloads and are configured separately.

## Full Event Reference

For the complete payload models, see [Clickatell's One API client callbacks documentation](https://help.clickatell.com/developers-api-reference/reference/one-api-client-callbacks).
