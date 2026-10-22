# Sendbird Webhooks Overview

## What Are Sendbird Webhooks?

With webhooks turned on for your Sendbird application, Sendbird's server sends HTTP POST requests with JSON payloads to your endpoint whenever subscribed events occur in your Chat application (messages, channel changes, user moderation, reports). They are commonly used to build custom notification services, such as SMS or email for offline users.

Each request has `user-agent: SendBird`, `content-type: application/json`, and an `x-sendbird-signature` header. The event type is the `category` field in the JSON body (there is no event-type header).

Sendbird waits **5 seconds** for a response and sends the same request **up to three times** until it gets one. Respond `200` immediately and process asynchronously.

## Common Event Types

The `category` value is exactly one of these strings (the handlers in `examples/` cover the first seven):

| Category | Invoked when |
|----------|--------------|
| `group_channel:message_send` | A message is sent within a group channel |
| `group_channel:create` | A group channel is created |
| `group_channel:join` | A user joins a group channel |
| `group_channel:leave` | A user leaves a group channel |
| `open_channel:message_send` | A message is sent within an open channel |
| `user:block` | A user blocks another user |
| `user:unblock` | A user unblocks another user |
| `group_channel:changed` | Group channel information is changed |
| `group_channel:remove` | A group channel is removed |
| `group_channel:invite` / `group_channel:decline_invite` | A user invites another user / declines an invitation |
| `group_channel:message_read` | A user has no more unread messages in a group channel |
| `group_channel:message_update` / `group_channel:message_delete` | A message is updated / deleted in a group channel |
| `group_channel:freeze_unfreeze` | A group channel is frozen or unfrozen |
| `group_channel:reaction_add` / `group_channel:reaction_delete` | A user adds / deletes reactions |
| `open_channel:create` / `open_channel:remove` | An open channel is created / removed |
| `open_channel:enter` / `open_channel:exit` | A user enters / exits an open channel |
| `open_channel:message_update` / `open_channel:message_delete` | A message is updated / deleted in an open channel |
| `user:mute` / `user:ban` / `user:deactivate` | A user is muted / banned / deactivated |
| `operators:register_by_operator` / `operators:unregister_by_operator` | Operators are registered / unregistered by another operator's client app |
| `message:report` / `user:report` / `open_channel:report` / `group_channel:report` | A message / user / open channel / group channel is reported |
| `alert:user_message_rate_limit_exceeded` | A user exceeds the allowed number of messages |
| `profanity_filter:replace` / `:block` / `:moderate` / `:detect` | Profanity filter actions |
| `advanced_profanity_filter:block` / `:no_action` / `:replace` | Advanced profanity filter actions |
| `message:moderation_extension_triggered` | A message triggers a custom moderation extension |
| `image_moderation:block` | A message with explicit images is blocked |
| `announcement:create_channels` / `announcement:send_messages` | Announcement channels created / messages sent |

You choose which categories to deliver in the dashboard, or via the Platform API ("Choose events to subscribe").

## Event Payload Structure

```json
{
  "category": "group_channel:message_send",
  "sender": { "user_id": "Jeff", "nickname": "Oldies but goodies" },
  "channel": { "channel_url": "sendbird_group_channel_1" },
  "payload": { "message": "Hello" }
}
```

Fields vary by category; the handlers read `sender`, `channel` and `payload` defensively. Check the docs for the full payload of each category.

## Full Event Reference

See [Sendbird webhook overview](https://sendbird.com/docs/chat/platform-api/v3/webhook/webhook-overview).
