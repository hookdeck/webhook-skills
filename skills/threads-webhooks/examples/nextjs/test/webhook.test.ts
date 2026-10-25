import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

// Set test environment variables before the route is used
beforeAll(() => {
  process.env.THREADS_APP_SECRET = APP_SECRET;
  process.env.THREADS_VERIFY_TOKEN = VERIFY_TOKEN;
});

import { GET, POST } from '../app/webhooks/threads/route';

const URL_BASE = 'http://localhost:3000/webhooks/threads';

// Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the app secret>
function sign(payload: string, secret: string = APP_SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function notification(field: string, value: Record<string, unknown>, topic = 'moderate'): string {
  return JSON.stringify({
    app_id: '123456',
    topic,
    target_id: '78901',
    time: 1723226877,
    subscription_id: '234567',
    has_uid_field: false,
    values: { value, field },
  });
}

function post(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (signature !== undefined) headers['x-hub-signature-256'] = signature;
  return new NextRequest(URL_BASE, { method: 'POST', headers, body });
}

const replyBody = notification('replies', {
  id: '8901234',
  username: 'test_username',
  replied_to: { id: '567890' },
});

describe('GET /webhooks/threads (handshake)', () => {
  it('echoes hub.challenge when mode and token match', async () => {
    const res = await GET(
      new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`)
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('1158201444');
  });

  it('returns 403 on a wrong verify token', async () => {
    const res = await GET(
      new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`)
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when hub.verify_token is missing', async () => {
    const res = await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.challenge=1`));
    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/threads (signature verification)', () => {
  it('accepts a valid signature', async () => {
    const res = await POST(post(replyBody, sign(replyBody)));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const res = await POST(post(replyBody, 'sha256=' + sign(replyBody).slice(7).toUpperCase()));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await POST(post(replyBody, sign(replyBody), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies a body with non-ASCII characters', async () => {
    const body = notification('mentions', { id: '1', username: 'u', text: 'héllo 🧵' }, 'interaction');
    const res = await POST(post(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await POST(post(replyBody))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await POST(post(replyBody, sign(replyBody, 'other_secret')))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(post(replyBody.replace('8901234', '9999999'), sign(replyBody)));
    expect(res.status).toBe(401);
  });

  it('rejects a header without the sha256= prefix', async () => {
    expect((await POST(post(replyBody, sign(replyBody).slice(7)))).status).toBe(401);
  });

  it('rejects the legacy sha1= prefix', async () => {
    expect((await POST(post(replyBody, 'sha1=' + sign(replyBody).slice(7)))).status).toBe(401);
  });

  it('rejects a short, long or non-hex digest instead of truncating it', async () => {
    const digest = sign(replyBody).slice(7);
    expect((await POST(post(replyBody, 'sha256=' + digest.slice(0, 40)))).status).toBe(401);
    expect((await POST(post(replyBody, 'sha256=' + digest.slice(0, 62) + 'zz'))).status).toBe(401);
    expect((await POST(post(replyBody, 'sha256=' + digest + 'ab'))).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await POST(post('not json', sign('not json'), 'text/plain'));
    expect(res.status).toBe(400);
  });
});

describe('event handling', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['replies', { id: '1', username: 'u', replied_to: { id: '2' } }, 'moderate'],
    ['mentions', { id: '1', username: 'u' }, 'interaction'],
    ['publish', { id: '1', username: 'u' }, 'interaction'],
    ['delete', { id: '1', deleted_at: '2024-08-07T10:33:16+0000' }, 'moderate'],
  ];

  it.each(cases)('handles %s', async (field, value, topic) => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = notification(field, value, topic);
    const res = await POST(post(body, sign(body)));
    expect(res.status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).not.toMatch(/Unhandled/);
    spy.mockRestore();
  });

  it('acknowledges unknown fields', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = notification('something_else', {});
    expect((await POST(post(body, sign(body)))).status).toBe(200);
    spy.mockRestore();
  });
});
