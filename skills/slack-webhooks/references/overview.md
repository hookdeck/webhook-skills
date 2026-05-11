# Slack Webhooks Overview

## What Are Slack Webhooks?

The Slack **Events API** lets your app subscribe to activity in workspaces where
it is installed (messages, mentions, reactions, member joins, etc.). Slack
delivers each event as an HTTPS POST to a single **Request URL** that you
configure in your Slack App's **Event Subscriptions** settings.

A separate Slack feature called *Incoming Webhooks* posts messages **into**
Slack and is not covered here. This skill is about **receiving** events from
Slack via the Events API.

## Request Flow

1. You configure a Request URL in your Slack App settings.
2. Slack sends a one-time `url_verification` request containing a `challenge`
   field. Your endpoint must echo the challenge back in the response body.
3. Once verified, Slack sends `event_callback` requests for every event your
   app is subscribed to.
4. Every request is signed with HMAC-SHA256. Verify the signature on every
   request before processing the body.

## Event Envelope

Every `event_callback` request has this outer structure:

```json
{
  "type": "event_callback",
  "team_id": "T0123456",
  "api_app_id": "A0123456",
  "event": {
    "type": "app_mention",
    "user": "U0123456",
    "text": "<@U7LFEMQ6F> hello!",
    "channel": "C0123456",
    "ts": "1731000000.000100"
  },
  "event_id": "Ev0123456",
  "event_time": 1731000000,
  "authorizations": [ /* ... */ ]
}
```

Always switch on the **inner** `payload.event.type`, not the outer `payload.type`
(which is almost always `event_callback`).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `app_mention` | The bot user is @mentioned in a channel | Chatbot replies, command parsing |
| `message` | A message is posted in a subscribed channel | Logging, moderation, automation |
| `reaction_added` | A user adds an emoji reaction to a message | Approval workflows, polls |
| `reaction_removed` | A user removes an emoji reaction | Undo approvals, retract votes |
| `team_join` | A new user joins the workspace | Onboarding DMs, CRM sync |
| `member_joined_channel` | A user joins a channel the app is in | Welcome messages, access provisioning |
| `app_home_opened` | A user opens the app's Home tab | Render the App Home view |

For the full list, see the [Slack Events reference](https://docs.slack.dev/reference/events).

## Response Requirements

Slack expects a `2xx` response **within 3 seconds**. If your handler can't
finish that fast, return `200` immediately and process the event asynchronously
(queue, background worker, etc.).

## Retry Behavior

If Slack doesn't get a `2xx` in time, it retries:

1. Almost immediately
2. After ~1 minute
3. After ~5 minutes

Each retry includes `X-Slack-Retry-Num` (1, 2, or 3) and `X-Slack-Retry-Reason`
(`http_timeout`, `http_error`, `connection_failed`, etc.). You can suppress
retries for a specific response by returning the header `X-Slack-No-Retry: 1`.

Because of retries, handlers **must be idempotent**. Use `event_id` as the
dedup key.

## Full Event Reference

- [Events API overview](https://docs.slack.dev/apis/events-api/)
- [Event types reference](https://docs.slack.dev/reference/events)
