// Generated with: telegram-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram does not sign webhook payloads. Instead, the secret_token passed to
// setWebhook is sent back unchanged in the X-Telegram-Bot-Api-Secret-Token
// header on every request.
// https://core.telegram.org/bots/api#setwebhook
function verifyTelegramSecretToken(headerValue, expectedSecret) {
  // Fail closed: no configured secret or no header means reject
  if (!headerValue || !expectedSecret) {
    return false;
  }

  const received = Buffer.from(headerValue);
  const expected = Buffer.from(expectedSecret);
  // timingSafeEqual throws on length mismatch, so check length first
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// An Update has update_id plus at most one optional field; that field's name
// is the update type (message, callback_query, ...).
function getUpdateType(update) {
  return Object.keys(update).find((key) => key !== 'update_id');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Telegram webhook endpoint
app.post('/webhooks/telegram',
  express.raw({ type: '*/*' }),
  (req, res) => {
    // Verify the secret token before parsing or acting on the payload
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (!verifyTelegramSecretToken(secretHeader, process.env.TELEGRAM_WEBHOOK_SECRET)) {
      console.error('Telegram webhook secret token verification failed');
      return res.status(401).send('Unauthorized');
    }

    let update;
    try {
      update = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (!update || typeof update !== 'object' || update.update_id === undefined) {
      return res.status(400).send('Invalid update');
    }

    // update_id is stable across retries: use it to skip duplicate deliveries
    const updateType = getUpdateType(update);
    console.log(`Received Telegram update ${update.update_id} (${updateType})`);

    switch (updateType) {
      case 'message': {
        const { chat, from, text } = update.message;
        console.log(`Message in chat ${chat?.id} from ${from?.username || from?.id}: ${text ?? '[non-text]'}`);
        // Reply with sendMessage using TELEGRAM_BOT_TOKEN
        break;
      }

      case 'edited_message': {
        const { chat, message_id } = update.edited_message;
        console.log(`Message ${message_id} edited in chat ${chat?.id}`);
        break;
      }

      case 'channel_post': {
        const { chat, text } = update.channel_post;
        console.log(`Channel post in ${chat?.title || chat?.id}: ${text ?? '[non-text]'}`);
        break;
      }

      case 'callback_query': {
        const { id, data, from } = update.callback_query;
        console.log(`Callback query ${id} from ${from?.id}: ${data}`);
        // Telegram clients show a spinner until answerCallbackQuery is called.
        // A webhook can make one Bot API call by returning it as the response.
        return res.json({ method: 'answerCallbackQuery', callback_query_id: id });
      }

      case 'inline_query': {
        const { id, query, from } = update.inline_query;
        console.log(`Inline query ${id} from ${from?.id}: "${query}"`);
        // Answer with answerInlineQuery
        break;
      }

      case 'my_chat_member': {
        const { chat, new_chat_member } = update.my_chat_member;
        console.log(`Bot status in chat ${chat?.id} is now ${new_chat_member?.status}`);
        break;
      }

      default:
        console.log(`Unhandled update type: ${updateType}`);
    }

    // Any 2XX acknowledges the update; other statuses make Telegram retry
    res.sendStatus(200);
  }
);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Telegram webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/telegram`);
    if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn('Warning: TELEGRAM_WEBHOOK_SECRET is not set; all webhook requests will be rejected');
    }
  });
}

module.exports = { app, verifyTelegramSecretToken, getUpdateType };
