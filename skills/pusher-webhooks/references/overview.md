# Pusher Channels Webhooks Overview

## What Are Pusher Channels Webhooks?

Pusher Channels sends an HTTP POST to a URL you configure, per app, whenever something happens in your channels: a channel gets its first subscriber or loses its last, a user joins or leaves a presence channel, a client event is sent, and so on. This is **Channels** only, not Pusher Beams.

Each request has a JSON body and two auth headers, `X-Pusher-Key` and `X-Pusher-Signature`. Respond with any 2xx to acknowledge; otherwise Pusher retries with exponential backoff for 5 minutes.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `channel_occupied` | A channel becomes occupied (at least one subscriber) | Start publishing to a channel only when someone is listening |
| `channel_vacated` | A channel has no subscribers left | Stop publishing, free resources |
| `member_added` | A user subscribes to a presence channel | Sync server-side presence state |
| `member_removed` | A user unsubscribes from a presence channel | Mark a user offline |
| `client_event` | A client event is sent on a private or presence channel | Persist or relay client-originated messages |
| `cache_miss` | A client subscribes to a cache channel with no cached message | Re-publish the latest state |
| `subscription_count` | Subscriber count on a channel changes (opt-in) | Live viewer counts |

## Event Payload Structure

Body (a single event unless batching is on):

```json
{
  "time_ms": 1327078148132,
  "events": [
    { "name": "channel_occupied", "channel": "my-channel" }
  ]
}
```

`time_ms` is the creation time in Unix milliseconds. Per-event fields:

| Event | Fields |
|-------|--------|
| `channel_occupied`, `channel_vacated`, `cache_miss` | `name`, `channel` |
| `member_added`, `member_removed` | `name`, `channel` (`presence-...`), `user_id` |
| `client_event` | `name`, `channel`, `event`, `data`, `socket_id`, `user_id` (presence channels only) |
| `subscription_count` | `name`, `channel`, `subscription_count` |

## Batching

With **batch webhooks** enabled, one request can contain many events, so loop over `events`. Pusher recommends handling them asynchronously so you return 2xx before timing out.

## Timing

- `channel_vacated` and `member_removed` are delayed up to 3 seconds after a disconnect; a reconnect inside that window sends nothing.
- `subscription_count` is sent every 5 seconds on busy channels (over 100 connections) while there is activity.

## Full Event Reference

For the complete list of events, see [Pusher Channels webhooks](https://pusher.com/docs/channels/server_api/webhooks/).
