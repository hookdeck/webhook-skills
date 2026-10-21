const request = require('supertest');

// Secret token in the format setWebhook accepts (A-Z a-z 0-9 _ -, 1-256 chars)
const SECRET = 'test_telegram_secret-Token_0123456789';
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

const { app, verifyTelegramSecretToken, getUpdateType } = require('../src/index');

const HEADER = 'X-Telegram-Bot-Api-Secret-Token';

function sendUpdate(update, secret = SECRET) {
  const req = request(app)
    .post('/webhooks/telegram')
    .set('Content-Type', 'application/json');
  if (secret !== null) req.set(HEADER, secret);
  return req.send(typeof update === 'string' ? update : JSON.stringify(update));
}

const chat = { id: 111111111, type: 'private', first_name: 'Ada' };
const from = { id: 111111111, is_bot: false, first_name: 'Ada', username: 'ada' };

describe('verifyTelegramSecretToken', () => {
  it('accepts the exact secret', () => {
    expect(verifyTelegramSecretToken(SECRET, SECRET)).toBe(true);
  });

  it('rejects a different secret of the same length', () => {
    const wrong = SECRET.slice(0, -1) + 'X';
    expect(verifyTelegramSecretToken(wrong, SECRET)).toBe(false);
  });

  it('rejects a different length without throwing', () => {
    expect(verifyTelegramSecretToken('short', SECRET)).toBe(false);
  });

  it('fails closed when the header or secret is missing', () => {
    expect(verifyTelegramSecretToken(undefined, SECRET)).toBe(false);
    expect(verifyTelegramSecretToken(SECRET, undefined)).toBe(false);
    expect(verifyTelegramSecretToken('', '')).toBe(false);
  });
});

describe('getUpdateType', () => {
  it('returns the optional field present in the update', () => {
    expect(getUpdateType({ update_id: 1, inline_query: {} })).toBe('inline_query');
  });
});

describe('POST /webhooks/telegram', () => {
  it('rejects requests without the secret token header', async () => {
    const res = await sendUpdate({ update_id: 1, message: { message_id: 1, chat, date: 0 } }, null);
    expect(res.status).toBe(401);
  });

  it('rejects requests with the wrong secret token', async () => {
    const res = await sendUpdate({ update_id: 1, message: { message_id: 1, chat, date: 0 } }, 'wrong_secret');
    expect(res.status).toBe(401);
  });

  it('rejects requests when no secret is configured', async () => {
    const saved = process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    try {
      const res = await sendUpdate({ update_id: 1, message: { message_id: 1, chat, date: 0 } });
      expect(res.status).toBe(401);
    } finally {
      process.env.TELEGRAM_WEBHOOK_SECRET = saved;
    }
  });

  it('returns 400 for invalid JSON with a valid token', async () => {
    const res = await sendUpdate('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 for JSON that is not an Update', async () => {
    const res = await sendUpdate({ hello: 'world' });
    expect(res.status).toBe(400);
  });

  it('accepts a message update', async () => {
    const res = await sendUpdate({
      update_id: 100,
      message: { message_id: 42, from, chat, date: 1760000000, text: '/start' },
    });
    expect(res.status).toBe(200);
  });

  it('accepts an edited_message update', async () => {
    const res = await sendUpdate({
      update_id: 101,
      edited_message: { message_id: 42, from, chat, date: 1760000000, edit_date: 1760000010, text: 'edited' },
    });
    expect(res.status).toBe(200);
  });

  it('accepts a channel_post update', async () => {
    const res = await sendUpdate({
      update_id: 102,
      channel_post: { message_id: 7, chat: { id: -1001234567890, type: 'channel', title: 'News' }, date: 1760000000, text: 'Hello' },
    });
    expect(res.status).toBe(200);
  });

  it('answers a callback_query in the webhook response', async () => {
    const res = await sendUpdate({
      update_id: 103,
      callback_query: { id: '4382bfdwdsb323b2d9', from, chat_instance: '-123', data: 'confirm:order_42' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ method: 'answerCallbackQuery', callback_query_id: '4382bfdwdsb323b2d9' });
  });

  it('accepts an inline_query update', async () => {
    const res = await sendUpdate({
      update_id: 104,
      inline_query: { id: '987654321', from, query: 'cats', offset: '' },
    });
    expect(res.status).toBe(200);
  });

  it('accepts a my_chat_member update', async () => {
    const res = await sendUpdate({
      update_id: 105,
      my_chat_member: {
        chat,
        from,
        date: 1760000000,
        old_chat_member: { status: 'member', user: { id: 222, is_bot: true, first_name: 'Bot' } },
        new_chat_member: { status: 'kicked', user: { id: 222, is_bot: true, first_name: 'Bot' }, until_date: 0 },
      },
    });
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown update types', async () => {
    const res = await sendUpdate({ update_id: 106, poll_answer: { poll_id: '1', option_ids: [0] } });
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
