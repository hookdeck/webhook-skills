# Wistia Webhooks Overview

## What Are Wistia Webhooks?

Wistia sends an HTTP POST to a URL you choose whenever a subscribed event happens in your account: a video finishes processing, a viewer plays or finishes part of a video, someone converts on a form, call to action or annotation, or someone registers for a live event. Each delivery has `Content-Type: application/json` and a `User-Agent` of the form `Wistia-Webhooks/{VERSION}`.

Every request carries an `X-Wistia-Signature` header, the hex HMAC-SHA256 of the raw body keyed with the Secret Key you set for the webhook. See [verification.md](verification.md).

## Delivery Behavior

- **At least once.** Wistia may send the same message more than once in rare cases, for example when your endpoint takes longer than the **10 second** request timeout.
- **Dedupe on the event `uuid`.** Events with the same `uuid` are the same event; ignore all but the first.
- **Order by `generated_at`.** Deliveries are not guaranteed to arrive in order. `generated_at` is ISO-8601 in UTC.
- **Batching.** If several events occur in a very short time, they are combined into a single POST, so the `events` array can hold more than one event.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `media.created` | A media is created | Track new uploads |
| `media.processing` | Processing is started | Show a "processing" state |
| `media.ready` | Processing is complete and all video and image assets are encoded | Publish the video, notify the uploader |
| `media.failed` | Processing failed | Alert and retry the upload |
| `media.updated` | A media is replaced or its title, description or thumbnail changes | Sync metadata (see `previous_attributes`) |
| `media.transcript_updated` | New captions are generated (automated or human) | Fetch the transcript for `transcript.language_code` |
| `media.transcript_failed` | Transcript generation failed | Alert; see `transcript.reason` |
| `media.deleted` | A media is deleted | Remove it from your catalog |
| `media.translation_created` | A translation is created for a media | Store the translated transcript |
| `media.localization_created` | A localization is created for a media | Publish the localized version |
| `media.localization_failed` | A localization failed | Alert and retry |
| `viewing_session.play` | A viewer plays a media | Engagement analytics |
| `viewing_session.percent_watched` | A viewer reaches a watch-percentage milestone | Progress tracking, lead scoring |
| `viewing_session.turnstile.converted` | A viewer submits a Wistia form | Send the lead to a CRM |
| `viewing_session.call_to_action.converted` | A viewer clicks a call to action | Conversion tracking |
| `viewing_session.annotation.converted` | A viewer clicks an annotation link | Conversion tracking |
| `live_event.registration` | Someone registers for a live event | Add the registrant to your system |

## Event Payload Structure

```json
{
  "hook": { "uuid": "a4ab9eb6-ab82-4dae-86f2-29f744f7d031" },
  "events": [
    {
      "uuid": "fc53f8f78b67d04d455029813f8ec1ef",
      "type": "media.ready",
      "payload": {
        "media": {
          "duration": 40.207,
          "id": "vpe2p82q64",
          "name": "Lenny Delivers Video!",
          "thumbnail": { "url": "https://embed-ssl.wistia.com/deliveries/e96ea382701bc172657d90bf269211beddbf6f7f.jpg?image_crop_resized=200x120" },
          "url": "https://harper.wistia.com/medias/vpe2p82q64"
        }
      },
      "metadata": { "account_id": "0sxav1wj8o" },
      "generated_at": "2024-03-31T21:56:45Z"
    }
  ]
}
```

- `hook.uuid` identifies the webhook message. `events` is always an array, even for a single event.
- Each event has `uuid`, `type`, `generated_at`, `metadata.account_id` and a `payload` whose shape depends on the type (`media`, `project`, `previous_attributes`, `transcript`, `localization`, `visitor`, `viewing_session`, `percent_watched`, `live_event`, `registration`, ...).
- `media.duration` is in seconds.

## Full Event Reference

For the complete list of events and payloads, see [Wistia's webhook documentation](https://docs.wistia.com/docs/webhooks).
