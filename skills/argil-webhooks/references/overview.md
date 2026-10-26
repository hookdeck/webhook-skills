# Argil Webhooks Overview

## What Are Argil Webhooks?

[Argil](https://www.argil.ai) generates AI avatar videos and trains custom avatars. A webhook sends a `POST` with a JSON body to your callback URL whenever a subscribed event happens, so you don't have to poll for a render or training to finish. One webhook can subscribe to several events. Webhooks are managed through the API (list, create, update, delete); see [setup.md](setup.md).

Deliveries are signed per [Standard Webhooks](https://www.standardwebhooks.com). Webhooks created before signing shipped are unsigned and must be recreated; see [verification.md](verification.md).

## Common Event Types

There are four events, matching the subscription enum of `POST /webhooks`:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `VIDEO_GENERATION_SUCCESS` | An avatar video render completes | Download or publish `videoUrl`, mark the job done |
| `VIDEO_GENERATION_FAILED` | A render fails | Alert, retry, check whether the credit debit was refunded |
| `AVATAR_TRAINING_SUCCESS` | An avatar training completes | Enable the avatar (`avatarId`, `voiceId`) in your app |
| `AVATAR_TRAINING_FAILED` | An avatar training fails | Notify the user, ask for new source footage |

The docs list these four and don't claim the list is exhaustive, so ignore events you don't recognise (return `200`).

## Event Payload Structure

Every body is `{ "event": "<NAME>", "data": { ... } }`. `event` is a SCREAMING_SNAKE string, identical to the subscription enum value. There is no event ID or timestamp in the body.

### VIDEO_GENERATION_SUCCESS

```json
{
  "event": "VIDEO_GENERATION_SUCCESS",
  "data": {
    "videoId": "<video_id>",
    "videoName": "<video_name>",
    "videoUrl": "<public_url_to_access_video>",
    "message": "Video generation completed successfully",
    "extras": "<additional_key-value_data_related_to_the_video>",
    "renderCost": 150,
    "renderCostRefunded": false
  }
}
```

`renderCost` is the credits debited for the render (`0` for a free render). `renderCostRefunded` is `false` on success.

### VIDEO_GENERATION_FAILED

```json
{
  "event": "VIDEO_GENERATION_FAILED",
  "data": {
    "videoId": "<video_id>",
    "videoName": "<video_name>",
    "message": "<why the render failed>",
    "extras": "<additional_key-value_data_related_to_the_video>",
    "renderCost": 150,
    "renderCostRefunded": true
  }
}
```

A failed render is refunded before the webhook is sent, so `renderCostRefunded` is usually `true`. If the refund itself failed it is `false` and the charge stands. A free render sends `renderCost: 0` and `renderCostRefunded: false`.

### AVATAR_TRAINING_SUCCESS

```json
{
  "event": "AVATAR_TRAINING_SUCCESS",
  "data": {
    "avatarId": "<avatar_id>",
    "voiceId": "<voice_id>",
    "avatarName": "<avatar_name>",
    "extras": "<additional_key-value_data_related_to_the_avatar>"
  }
}
```

### AVATAR_TRAINING_FAILED

```json
{
  "event": "AVATAR_TRAINING_FAILED",
  "data": {
    "avatarId": "<avatar_id>",
    "avatarName": "<avatar_name>",
    "extras": "<additional_key-value_data_related_to_the_avatar>"
  }
}
```

The docs page for this event says `AVATAR_GENERATION_FAILED` in its prose, but the payload example and the subscription enum both use `AVATAR_TRAINING_FAILED`.

The same video fields are also sent to a one-shot `callbackUrl` passed to `POST /videos/{id}/render`. Argil's docs don't say whether those calls are signed, so check before relying on that.

## Delivery and Retries

- Respond `2xx` within **10 seconds**; redirects are not followed.
- Retries after 30 seconds, 2 minutes, 10 minutes, 1 hour, 6 hours, then every 12 hours, for 3 days.
- At least once, possibly out of order: dedupe on the `webhook-id` header, which stays the same across retries.
- `410 Gone` disables the webhook. A webhook failing for 3 days is disabled and the workspace owner emailed. Updating a disabled webhook re-enables it.

## Full Event Reference

See [Argil's webhook documentation](https://docs.argil.ai/pages/webhook-events/introduction).
