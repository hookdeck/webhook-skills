import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/telegram/route';
import { getUpdateType, verifyTelegramSecretToken } from '../lib/telegram';

// Secret token in the format setWebhook accepts (A-Z a-z 0-9 _ -, 1-256 chars)
const SECRET = 'test_telegram_secret-Token_0123456789';

function createRequest(body: unknown, secret: string | null = SECRET): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['X-Telegram-Bot-Api-Secret-Token'] = secret;
  return new NextRequest('http://localhost:3000/webhooks/telegram', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const chat = { id: 111111111, type: 'private', first_name: 'Ada' };
const from = { id: 111111111, is_bot: false, first_name: 'Ada', username: 'ada' };

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
});

describe('verifyTelegramSecretToken', () => {
  it('accepts the exact secret', () => {
    expect(verifyTelegramSecretToken(SECRET, SECRET)).toBe(true);
  });

  it('rejects a different secret of the same length', () => {
    expect(verifyTelegramSecretToken(SECRET.slice(0, -1) + 'X', SECRET)).toBe(false);
  });

  it('rejects a different length without throwing', () => {
    expect(verifyTelegramSecretToken('short', SECRET)).toBe(false);
  });

  it('fails closed when the header or secret is missing', () => {
    expect(verifyTelegramSecretToken(null, SECRET)).toBe(false);
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
  const message = { update_id: 1, message: { message_id: 1, chat, date: 0 } };

  it('rejects requests without the secret token header', async () => {
    const res = await POST(createRequest(message, null));
    expect(res.status).toBe(401);
  });

  it('rejects requests with the wrong secret token', async () => {
    const res = await POST(createRequest(message, 'wrong_secret'));
    expect(res.status).toBe(401);
  });

  it('rejects requests when no secret is configured', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const res = await POST(createRequest(message));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON with a valid token', async () => {
    const res = await POST(createRequest('{not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for JSON that is not an Update', async () => {
    const res = await POST(createRequest({ hello: 'world' }));
    expect(res.status).toBe(400);
  });

  it('accepts a message update', async () => {
    const res = await POST(createRequest({
      update_id: 100,
      message: { message_id: 42, from, chat, date: 1760000000, text: '/start' },
    }));
    expect(res.status).toBe(200);
  });

  it('accepts an edited_message update', async () => {
    const res = await POST(createRequest({
      update_id: 101,
      edited_message: { message_id: 42, from, chat, date: 1760000000, edit_date: 1760000010, text: 'edited' },
    }));
    expect(res.status).toBe(200);
  });

  it('accepts a channel_post update', async () => {
    const res = await POST(createRequest({
      update_id: 102,
      channel_post: { message_id: 7, chat: { id: -1001234567890, type: 'channel', title: 'News' }, date: 1760000000, text: 'Hello' },
    }));
    expect(res.status).toBe(200);
  });

  it('answers a callback_query in the webhook response', async () => {
    const res = await POST(createRequest({
      update_id: 103,
      callback_query: { id: '4382bfdwdsb323b2d9', from, chat_instance: '-123', data: 'confirm:order_42' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ method: 'answerCallbackQuery', callback_query_id: '4382bfdwdsb323b2d9' });
  });

  it('accepts an inline_query update', async () => {
    const res = await POST(createRequest({
      update_id: 104,
      inline_query: { id: '987654321', from, query: 'cats', offset: '' },
    }));
    expect(res.status).toBe(200);
  });

  it('accepts a my_chat_member update', async () => {
    const res = await POST(createRequest({
      update_id: 105,
      my_chat_member: {
        chat,
        from,
        date: 1760000000,
        old_chat_member: { status: 'member', user: { id: 222, is_bot: true, first_name: 'Bot' } },
        new_chat_member: { status: 'kicked', user: { id: 222, is_bot: true, first_name: 'Bot' }, until_date: 0 },
      },
    }));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown update types', async () => {
    const res = await POST(createRequest({ update_id: 106, poll_answer: { poll_id: '1', option_ids: [0] } }));
    expect(res.status).toBe(200);
  });
});
