import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

// Set test environment variables before the route is used
beforeAll(() => {
  process.env.INSTAGRAM_APP_SECRET = APP_SECRET;
  process.env.INSTAGRAM_VERIFY_TOKEN = VERIFY_TOKEN;
});

import { GET, POST } from '../app/webhooks/instagram/route';

const URL_BASE = 'http://localhost:3000/webhooks/instagram';
const ACCOUNT_ID = '17841405726653026';

// Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the app secret>
function sign(payload: string, secret: string = APP_SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function changeBody(field: string, value: Record<string, unknown>): string {
  return JSON.stringify({
    object: 'instagram',
    entry: [{ id: ACCOUNT_ID, time: 1520622968, changes: [{ field, value }] }],
  });
}

function messagingBody(item: Record<string, unknown>, key = 'messaging'): string {
  return JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: ACCOUNT_ID,
        time: 1569262486134,
        [key]: [{ sender: { id: 'IGSID' }, recipient: { id: ACCOUNT_ID }, timestamp: 1569262485349, ...item }],
      },
    ],
  });
}

function post(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (signature !== undefined) headers['x-hub-signature-256'] = signature;
  return new NextRequest(URL_BASE, { method: 'POST', headers, body });
}

const commentBody = changeBody('comments', {
  id: '17865799348089039',
  from: { id: '1234567890', username: 'test_user' },
  text: 'Nice post',
  media: { id: '17918195224117851', media_product_type: 'FEED' },
});

const escapedBody = changeBody('comments', { id: '1', text: 'PLACEHOLDER' }).replace(
  'PLACEHOLDER',
  '\\u00e4\\u00f6\\u00e5'
);

describe('GET /webhooks/instagram (handshake)', () => {
  it('echoes hub.challenge when mode and token match', async () => {
    const res = await GET(
      new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`)
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('1158201444');
  });

  it('returns 403 on a wrong verify token', async () => {
    const res = await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`));
    expect(res.status).toBe(403);
  });

  it('returns 403 when hub.verify_token is missing', async () => {
    const res = await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.challenge=1`));
    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/instagram (signature verification)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid signature', async () => {
    expect((await POST(post(commentBody, sign(commentBody)))).status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    expect((await POST(post(commentBody, 'sha256=' + sign(commentBody).slice(7).toUpperCase()))).status).toBe(200);
  });

  it('verifies any content type', async () => {
    expect((await POST(post(commentBody, sign(commentBody), 'text/plain'))).status).toBe(200);
  });

  it('verifies the escaped-unicode bytes Meta signs', async () => {
    expect((await POST(post(escapedBody, sign(escapedBody)))).status).toBe(200);
  });

  it('rejects a signature computed over re-serialized (decoded) JSON', async () => {
    const reserialized = JSON.stringify(JSON.parse(escapedBody));
    expect(reserialized).not.toBe(escapedBody);
    expect((await POST(post(escapedBody, sign(reserialized)))).status).toBe(401);
  });

  it('verifies a raw UTF-8 body', async () => {
    const body = changeBody('comments', { id: '1', text: 'héllo 📸' });
    expect((await POST(post(body, sign(body)))).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await POST(post(commentBody))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await POST(post(commentBody, sign(commentBody, 'other_secret')))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await POST(post(commentBody.replace('Nice', 'Mean'), sign(commentBody)))).status).toBe(401);
  });

  it('rejects a header without the sha256= prefix', async () => {
    expect((await POST(post(commentBody, sign(commentBody).slice(7)))).status).toBe(401);
  });

  it('rejects the legacy sha1= prefix', async () => {
    expect((await POST(post(commentBody, 'sha1=' + sign(commentBody).slice(7)))).status).toBe(401);
  });

  it('rejects a short, long or non-hex digest instead of truncating it', async () => {
    const digest = sign(commentBody).slice(7);
    expect((await POST(post(commentBody, 'sha256=' + digest.slice(0, 40)))).status).toBe(401);
    expect((await POST(post(commentBody, 'sha256=' + digest.slice(0, 62) + 'zz'))).status).toBe(401);
    expect((await POST(post(commentBody, 'sha256=' + digest + 'ab'))).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await POST(post('not json', sign('not json'), 'text/plain'))).status).toBe(400);
  });

  it('returns 400 for a validly signed non-object JSON body', async () => {
    expect((await POST(post('42', sign('42')))).status).toBe(400);
  });
});

describe('event handling', () => {
  const cases: Array<[string, string]> = [
    ['comments (Instagram Login)', changeBody('comments', { id: '1', from: { username: 'u' }, media: { id: '2' } })],
    ['comments (Facebook Login)', changeBody('comments', { comment_id: '1', from: { username: 'u' }, media: { id: '2' } })],
    ['live_comments', changeBody('live_comments', { comment_id: '1', from: { username: 'u' }, media: { id: '2' } })],
    ['mentions', changeBody('mentions', { media_id: '1', comment_id: '2' })],
    ['story_insights', changeBody('story_insights', { media_id: '1', impressions: 44, reach: 40 })],
    ['messages', messagingBody({ message: { mid: 'MID', text: 'Hi' } })],
    ['message echo', messagingBody({ message: { mid: 'MID', text: 'Hi', is_echo: true } })],
    ['message deleted', messagingBody({ message: { mid: 'MID', is_deleted: true } })],
    ['message_reactions', messagingBody({ reaction: { mid: 'MID', action: 'unreact' } })],
    ['messaging_postbacks', messagingBody({ postback: { mid: 'MID', title: 'Hours?', payload: 'HOURS' } })],
    ['messaging_referral', messagingBody({ referral: { ref: 'promo', source: 'https://ig.me/x', type: 'OPEN_THREAD' } })],
    ['messaging_seen', messagingBody({ read: { mid: 'MID' } })],
    ['message_edit', messagingBody({ message_edit: { mid: 'MID', text: 'edited', num_edit: 1 } })],
    ['standby message', messagingBody({ message: { mid: 'MID', text: 'Hi' } }, 'standby')],
  ];

  it.each(cases)('handles %s', async (_name, body) => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(post(body, sign(body)));
    expect(res.status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).not.toMatch(/Unhandled|Ignoring/);
    spy.mockRestore();
  });

  it('accepts a notification wrapped in an array', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = `[${commentBody}]`;
    expect((await POST(post(body, sign(body)))).status).toBe(200);
    spy.mockRestore();
  });

  it('acknowledges unknown fields', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = changeBody('something_else', {});
    expect((await POST(post(body, sign(body)))).status).toBe(200);
    spy.mockRestore();
  });
});
