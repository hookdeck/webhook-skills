// Generated with: telegram-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { getUpdateType, verifyTelegramSecretToken, type TelegramUpdate } from '../../../lib/telegram';

export async function POST(request: NextRequest) {
  // Verify the secret token before parsing or acting on the payload
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
  if (!verifyTelegramSecretToken(secretHeader, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    console.error('Telegram webhook secret token verification failed');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = JSON.parse(await request.text());
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (!update || typeof update !== 'object' || update.update_id === undefined) {
    return new NextResponse('Invalid update', { status: 400 });
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
      return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: id });
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
  return new NextResponse(null, { status: 200 });
}
