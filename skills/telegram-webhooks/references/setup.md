# Setting Up Telegram Webhooks

Telegram has no webhook dashboard. You configure the webhook by calling the Bot API
method [`setWebhook`](https://core.telegram.org/bots/api#setwebhook) with your bot token.

## Prerequisites

- A Telegram bot and its token (from [@BotFather](https://t.me/BotFather))
- A public **HTTPS** URL (TLS 1.2+) on port **443, 80, 88 or 8443**. Plain HTTP is
  not accepted, and IPv6 is not supported for webhooks.

## 1. Create a Bot and Get Its Token

1. Open a chat with [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Follow the prompts. BotFather replies with a token like `123456789:AAH...`.
3. Store it as `TELEGRAM_BOT_TOKEN`. Treat it as a password: anyone with it controls the bot.

## 2. Generate a Secret Token

The secret token is how your handler knows a request came from the webhook you set. It
must be 1-256 characters using only `A-Z`, `a-z`, `0-9`, `_` and `-`:

```bash
# 64 hex characters, which is within the allowed character set
openssl rand -hex 32
```

Store it as `TELEGRAM_WEBHOOK_SECRET`. Don't reuse the bot token: it contains `:`, which
is not allowed, and it is a far more valuable secret.

## 3. Register Your Endpoint

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhooks/telegram",
    "secret_token": "'"${TELEGRAM_WEBHOOK_SECRET}"'",
    "allowed_updates": ["message", "edited_message", "channel_post", "callback_query", "inline_query", "my_chat_member"]
  }'
```

`setWebhook` parameters:

| Parameter | Notes |
|-----------|-------|
| `url` | HTTPS URL. Use an empty string to remove the webhook |
| `secret_token` | Sent back in `X-Telegram-Bot-Api-Secret-Token` on every request |
| `allowed_updates` | Update types to receive. Empty list = everything except `chat_member`, `message_reaction`, `message_reaction_count`. Omitted = keep the previous setting |
| `max_connections` | 1-100 concurrent connections, default 40 |
| `drop_pending_updates` | `true` discards updates queued while no webhook was reachable |
| `certificate` | Upload your public cert when using a self-signed certificate |
| `ip_address` | Fixed IP to deliver to instead of resolving the URL's DNS |

A successful call returns `{"ok":true,"result":true,"description":"Webhook was set"}`.

## 4. Check Delivery Status

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Watch `pending_update_count`, `last_error_date` and `last_error_message`. A growing
queue and a message like `Wrong response from the webhook: 401 Unauthorized` usually
mean the secret in your environment doesn't match the one passed to `setWebhook`.

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 telegram --path /webhooks/telegram   # Express / Next.js
npx hookdeck-cli listen 8000 telegram --path /webhooks/telegram   # FastAPI
```

Pass the HTTPS URL it prints (with `/webhooks/telegram`) as `url` to `setWebhook`.

## Switching Back to Polling

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"
```

## Test Mode

Telegram has no separate test mode for webhooks. Use a dedicated development bot (a second
BotFather bot with its own token and webhook) so local testing never touches production.
