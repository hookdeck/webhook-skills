# Telegram Webhooks - Next.js Example

Minimal example of receiving Telegram Bot API webhooks with secret token verification in the Next.js App Router.

## Prerequisites

- Node.js 20.9+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A secret token for `setWebhook` (1-256 characters: `A-Z a-z 0-9 _ -`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret (`openssl rand -hex 32`) and add it to `.env` as
   `TELEGRAM_WEBHOOK_SECRET`. Add your bot token as `TELEGRAM_BOT_TOKEN`.

## Run

```bash
npm run dev
```

App runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/telegram` (handler in `app/webhooks/telegram/route.ts`)

## Test

Run the test suite:

```bash
npm test
```

To receive real updates locally:

1. Start a tunnel with the [Hookdeck CLI](https://hookdeck.com/docs/cli) (no account needed):
   ```bash
   npx hookdeck-cli listen 3000 telegram --path /webhooks/telegram
   ```

2. Register the tunnel URL with Telegram, passing the same secret:
   ```bash
   curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://<your-tunnel-url>/webhooks/telegram", "secret_token": "'"${TELEGRAM_WEBHOOK_SECRET}"'"}'
   ```

3. Send your bot a message in Telegram. Check delivery status with
   `curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"`.

## Update Types Handled

- `message`
- `edited_message`
- `channel_post`
- `callback_query` (answered with `answerCallbackQuery` in the webhook response)
- `inline_query`
- `my_chat_member`

Other update types are logged and acknowledged with `200`.

## Security

- Compares `X-Telegram-Bot-Api-Secret-Token` with `TELEGRAM_WEBHOOK_SECRET` using `crypto.timingSafeEqual` (see `lib/telegram.ts`)
- Fails closed: returns `401` if the header is missing, wrong, or no secret is configured
- Returns `400` for bodies that aren't a JSON `Update`
- Deduplicate on `update_id` in production: Telegram retries any non-2XX response
