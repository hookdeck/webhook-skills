# Telegram Webhooks Overview

## What Are Telegram Webhooks?

A Telegram bot receives activity (messages, button presses, inline queries, membership
changes) as **updates**. The Bot API offers two mutually exclusive ways to get them:

- **`getUpdates`** – long polling; your bot pulls updates.
- **`setWebhook`** – push; Telegram sends an HTTPS `POST` to your URL with one
  JSON-serialized [`Update`](https://core.telegram.org/bots/api#update) per request.

While a webhook is set, `getUpdates` stops working. Telegram stores undelivered updates
for up to 24 hours. If your endpoint answers with any status other than 2XX, Telegram
repeats the request and gives up "after a reasonable amount of attempts".

## How Do I Tell Which Kind of Update I Received?

There is no `type` or `event` field. Each `Update` contains `update_id` plus **at most
one** optional field, and the name of that field is the update type:

```javascript
const updateType = Object.keys(update).find((key) => key !== 'update_id');
```

## Common Update Types

| Update field | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `message` | New incoming message of any kind (text, photo, sticker, ...) | Commands (`/start`), chat replies, file intake |
| `edited_message` | A message known to the bot was edited | Re-process edited commands or content |
| `channel_post` | New post in a channel the bot belongs to | Channel mirroring, moderation, archiving |
| `callback_query` | A user pressed an inline keyboard button | Menus, confirmations, pagination (answer with `answerCallbackQuery`) |
| `inline_query` | A user typed `@yourbot query` in any chat | Inline search results (answer with `answerInlineQuery`) |
| `my_chat_member` | The bot's own member status changed in a chat | Track groups the bot was added to/removed from; users blocking the bot |

## Other Update Types

| Update field | Notes |
|--------------|-------|
| `edited_channel_post` | Edited channel post |
| `business_connection`, `business_message`, `edited_business_message`, `deleted_business_messages` | Telegram Business accounts connected to the bot |
| `message_reaction`, `message_reaction_count` | Must be listed explicitly in `allowed_updates`; bot must be an admin |
| `chosen_inline_result` | Requires inline feedback to be enabled via @BotFather |
| `shipping_query`, `pre_checkout_query` | Payments (answer `pre_checkout_query` within 10 seconds) |
| `purchased_paid_media` | A user bought paid media sent by the bot |
| `poll`, `poll_answer` | Poll state and votes on polls the bot sent |
| `chat_member` | Another member's status changed; must be listed in `allowed_updates`; bot must be an admin |
| `chat_join_request` | Join request; bot needs `can_invite_users` |
| `chat_boost`, `removed_chat_boost` | Chat boosts; bot must be an admin |

Telegram adds update types regularly, so always have a default branch that logs and
acknowledges unknown types. By default (empty `allowed_updates`) you receive every type
except `chat_member`, `message_reaction` and `message_reaction_count`.

## Event Payload Structure

```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "from": { "id": 111111111, "is_bot": false, "first_name": "Ada", "username": "ada" },
    "chat": { "id": 111111111, "first_name": "Ada", "username": "ada", "type": "private" },
    "date": 1760000000,
    "text": "/start",
    "entities": [{ "offset": 0, "length": 6, "type": "bot_command" }]
  }
}
```

A `callback_query` update:

```json
{
  "update_id": 123456790,
  "callback_query": {
    "id": "4382bfdwdsb323b2d9",
    "from": { "id": 111111111, "is_bot": false, "first_name": "Ada" },
    "message": { "message_id": 43, "chat": { "id": 111111111, "type": "private" }, "date": 1760000001 },
    "chat_instance": "-1234567890123456789",
    "data": "confirm:order_42"
  }
}
```

Key fields:

- `update_id` – sequential identifier. Use it to drop duplicate deliveries (retries
  resend the same `update_id`) and to restore order. After a week with no updates the
  next ID is random instead of sequential.
- `message.chat.id` – where to send replies with `sendMessage`.
- `callback_query.id` – must be passed to `answerCallbackQuery`, or the user's client
  shows a loading spinner on the button.

## Replying From the Webhook Response

Instead of making a separate Bot API call, a webhook handler can put one Bot API method
call in its HTTP response: return JSON with a `method` field plus that method's
parameters, for example:

```json
{ "method": "answerCallbackQuery", "callback_query_id": "4382bfdwdsb323b2d9" }
```

You can't learn whether that call succeeded. The examples in this skill use it to answer
`callback_query` updates and return an empty `200` for everything else.

## Full Event Reference

For the complete `Update` reference, see the [Telegram Bot API documentation](https://core.telegram.org/bots/api#update).
