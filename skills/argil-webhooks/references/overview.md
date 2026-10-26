# Argil Webhooks Overview

## What Are Argil Webhooks?

[Argil](https://www.argil.ai) is an AI avatar video generation platform. Its webhooks notify your server when a video finishes or fails to render and when an avatar finishes or fails training, so you don't have to poll. Webhooks are managed through the API and each delivery is signed per Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

## Common Event Types

Four events are documented. The list may not be exhaustive, so acknowledge unknown event names with `200`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `VIDEO_GENERATION_SUCCESS` | A video finished rendering | Download or publish `videoUrl`, record `renderCost` |
| `VIDEO_GENERATION_FAILED` | A video failed to render | Alert, retry, reconcile credits (`renderCostRefunded`) |
| `AVATAR_TRAINING_SUCCESS` | An avatar finished training | Mark the avatar (`avatarId`) usable |
| `AVATAR_TRAINING_FAILED` | Avatar training failed | Notify the user, ask for new footage |

You subscribe to events with the `events` list when you create the webhook. One webhook can subscribe to several events.

## Event Payload Structure

The body is `{event, data}`. The event name is the top-level `event` (SCREAMING_SNAKE, the same strings as the subscription enum) beside `data`. There is no event ID in the body.

Video events:

```json
{
  "event": "VIDEO_GENERATION_SUCCESS",
  "data": {
    "videoId": "vid_123",
    "videoName": "Product intro",
    "videoUrl": "https://...",
    "message": "...",
    "extras": {},
    "renderCost": 10,
    "renderCostRefunded": 0
  }
}
```

Avatar events:

```json
{
  "event": "AVATAR_TRAINING_SUCCESS",
  "data": { "avatarId": "avt_123", "avatarName": "Alex", "extras": {} }
}
```

## Delivery Semantics

- POST with a JSON body to your callback URL. Return `2xx` within 10 seconds. Redirects are not followed.
- Retries after 30 s, 2 min, 10 min, 1 h, 6 h, then every 12 h for 3 days.
- A `410` response disables the webhook. So do 3 days of failures, and the owner is emailed.
- Delivery is at-least-once and unordered. Dedupe on the `webhook-id` header, which is the same on every retry.

## Full Event Reference

For the complete list of events, see [Argil's webhook documentation](https://docs.argil.ai/pages/webhook-events/introduction).
