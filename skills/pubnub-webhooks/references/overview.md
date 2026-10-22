# PubNub Webhooks Overview

## What Are PubNub Webhooks?

PubNub's Events & Actions pairs an **event listener** (which watches an event source and filters
events) with an **action**. A **Webhook action** forwards each matching event as an HTTP request
to an HTTPS endpoint you control. This skill covers that Webhook action. Webhooks configured on the
legacy Keysets page are a different mechanism and aren't covered.

Webhooks are **unsigned**. The only authentication available is a custom header you add to the
action, with a value taken from a keyset secret. See [verification.md](verification.md).

Delivery succeeds on a `2XX` response. PubNub follows a `301` for up to three redirects and, if
you enabled **Webhook retry** (paid tiers), retries other statuses with jittered backoff (default 2
retries, 450 s base interval; up to 4 retries, 900 s).

## Common Event Types

With **Is Enveloped** off (the "No Envelope" layout), the event type is the `dataSchema` with the
`pubnub.com/schemas/events/` prefix and the `?v=1.0.0` version removed.

| Event type | Triggered When | Common Use Cases |
|------------|----------------|------------------|
| `messages.pubsub.publish` | A message is published, or a file is sent | Moderation, archiving, notifications |
| `messages.action.created` / `messages.action.deleted` | A message action (reaction, receipt) is added or removed | Sync reactions |
| `presence.user.channel.joined` | A user subscribes to a channel | Online status, analytics |
| `presence.user.channel.left` | A user unsubscribes | Online status |
| `presence.user.timedout.in.channel` | A subscription drops without unsubscribe | Detect dropped clients |
| `presence.channel.user.state.in.changed` | A user's presence state changes | Status sync |
| `presence.channel.state.active` / `presence.channel.state.inactive` | First user subscribes / last user leaves | Room lifecycle |
| `presence.channel.occupancy.counted` | A channel reports occupancy at its interval | Occupancy dashboards |
| `user.created` / `user.updated` / `user.deleted` | User metadata changes | Sync profiles |
| `channel.created` / `channel.updated` / `channel.deleted` | Channel metadata changes | Sync rooms |
| `membership.created` / `membership.updated` / `membership.deleted` | User-channel membership metadata changes | Sync membership |
| `push.device.removed` | A device token is removed from a channel's push registration | Clean up tokens |
| `push.message.sending.failed` | A mobile push attempt fails | Alerting |

## Event Payload Structure

No Envelope body:

```json
{
  "dataSchema": "pubnub.com/schemas/events/user.created?v=1.0.0",
  "data": [
    { "id": "9dc756ca-0be4-4c82-bc46-84e1a08782fb", "userId": "User_id", "name": "User Name",
      "timestamp": "2025-06-05T13:11:54.517788662Z" }
  ]
}
```

`data` is an array; each item is one event whose fields depend on the type. Message and file items
use `senderId` and `channel`; message actions, presence and metadata items use `userId`;
channel metadata uses `channelId`.

Enveloped payloads (V1, V2, V2.1) use a different layout (`event`, `metadata`, and `schema` instead of
`dataSchema`). Turn **Is Enveloped** off, or adapt the parsing. When batching is on, the Webhook
action sends several events in one request; the docs don't describe the batch body, so leave
batching off unless you have checked what your endpoint receives.

## Full Event Reference

- [Events & Actions payloads](https://www.pubnub.com/docs/integrations/event-forwarding/payloads)
- [Event sources](https://www.pubnub.com/docs/integrations/event-forwarding/event-sources)
- [Create a Webhook action](https://www.pubnub.com/docs/integrations/event-forwarding/create-webhook-action)
