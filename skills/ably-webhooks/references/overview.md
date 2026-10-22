# Ably Webhooks Overview

## What Are Ably Webhooks?

Ably outbound webhook integration rules `POST` events to an HTTP endpoint when messages are published, presence events occur, channel occupancy changes, or channels are created or discarded. Events can be sent one per request (single mode) or grouped (batch mode), enveloped with metadata or as the raw payload, and encoded as JSON or msgpack. Signing with an API key is optional.

## Common Event Types

Ably calls these "event types"; they appear as the `source` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `channel.message` | A message is published on a matching channel | Persist chat messages, trigger workflows |
| `channel.presence` | A client enters, leaves or updates presence | Online status, audit logs |
| `channel.lifecycle` | A channel is created (`channel.opened`) or discarded (`channel.closed`) | Resource tracking |
| `channel.occupancy` | The number of users on a channel changes | Usage metrics, empty-room cleanup |

Use `channel.lifecycle` and `channel.occupancy` rather than `channel.message` on metachannels.

## Event Payload Structure

**Enveloped** (default; recommended):

```json
{
  "source": "channel.message",
  "appId": "aBCdEf",
  "channel": "channel-name",
  "site": "eu-central-1-A",
  "ruleId": "1-a2Bc",
  "messages": [{ "id": "ABcDefgHIj:1:0", "connectionId": "ABcDefgHIj", "timestamp": 1123145678900, "data": "some message data", "name": "my message name" }]
}
```

Presence events carry a `presence` array instead of `messages`, with a numeric `action` (`0` absent, `1` present, `2` enter, `3` leave, `4` update).

**Batched** requests wrap events in `items`:

```json
{ "items": [{ "webhookId": "ABcDEf", "source": "channel.lifecycle", "name": "channel.opened", "timestamp": 1562124922426, "serial": "a7bcdEFghIjklm123456789:4", "data": { "channelId": "my-channel-5", "status": { "isActive": true } } }] }
```

For batches `data` holds `channelId` and `messages`, `presence` or `status` depending on `source`.

**Non-enveloped** requests send only the data as the body (`application/json`, `text/plain` or `application/octet-stream`). Metadata arrives in headers: `x-ably-envelope-source`, `x-ably-envelope-channel`, `x-ably-envelope-appid`, `x-ably-envelope-rule-id`, `x-ably-envelope-site`, `x-ably-message-name`, `x-ably-message-client-id`, `x-ably-message-connection-id`, `x-ably-message-id`, `x-ably-message-timestamp`. These headers are **not** signed.

All requests carry `x-ably-version` (currently `1.2`) and a `content-type` of `application/json` or `application/x-msgpack` (enveloped and batched).

## Decoding

Raw messages are not auto-decoded. Use the Ably SDK's `Message.fromEncodedArray` / `PresenceMessage.fromEncodedArray` to restore `data` types, convert presence actions to strings, and decrypt with your channel key.

## Delivery and Retries

- Single requests: failed `5XX` responses are retried; on a timeout Ably retries twice, after 4 s and 20 s.
- Batched requests: exponential backoff from 1 s (×√2 per attempt) up to 60 s; events are kept for 5 minutes then discarded.
- Order is only preserved for batched requests from the same publisher on the same channel.

## Full Event Reference

See [Ably outbound webhooks](https://ably.com/docs/platform/integrations/webhooks).
