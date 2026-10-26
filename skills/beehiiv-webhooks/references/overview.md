# beehiiv Webhooks Overview

## What Are beehiiv Webhooks?

beehiiv sends an HTTP POST to your endpoint when something happens in your publication: a subscriber signs up or changes tier, a post is sent or scheduled, a survey is answered, a podcast episode is published. Deliveries go out through Svix, so each request is signed with `svix-id`, `svix-timestamp` and `svix-signature` headers. Webhooks need a paid plan (Lite and above).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `post.sent` | A post is sent | Cross-post, notify a team channel |
| `post.updated` | A post is updated | Refresh a mirrored copy |
| `post.scheduled` | A post is scheduled | Update a content calendar |
| `subscription.created` | A subscription is created | Add to CRM, start onboarding |
| `subscription.confirmed` | A subscriber confirms | Mark as verified |
| `subscription.deleted` | A subscription is deleted | Suppress downstream messaging |
| `subscription.upgraded` | A subscriber moves to a higher tier | Grant paid access |
| `subscription.downgraded` | A subscriber moves to a lower tier | Revoke paid access |
| `subscription.paused` | A subscription is paused | Pause access |
| `subscription.resumed` | A subscription is resumed | Restore access |
| `newsletter_list_subscription.subscribed` | A subscriber joins a newsletter list | Segment, sync lists |
| `survey.response_submitted` | A survey response is submitted | Store feedback |
| `podcasts.episode.published` | A podcast episode is published | Notify, syndicate |

beehiiv documents further event types; the examples log unknown ones and return 200.

## Event Payload Structure

```json
{
  "uid": "evt_...",
  "event_type": "subscription.created",
  "event_timestamp": 1792922400,
  "data": { }
}
```

| Field | Notes |
|-------|-------|
| `uid` | Event identifier, usable as a dedupe key |
| `event_type` | Dispatch on this |
| `event_timestamp` | When the event was created: an integer, seconds since the Unix epoch |
| `data` | Event-specific object; check beehiiv's docs for each type |

## Delivery Notes

- `svix-id` is the same on every retry of a message.
- Respond with a 2xx quickly and process asynchronously.

## Full Event Reference

For the complete list of events and payloads, see [beehiiv's webhook documentation](https://developers.beehiiv.com/webhooks).
