import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

// Set test environment variables before the route is used
beforeAll(() => {
  process.env.MESSENGER_APP_SECRET = APP_SECRET;
  process.env.MESSENGER_VERIFY_TOKEN = VERIFY_TOKEN;
});

import { GET, POST } from '../app/webhooks/messenger/route';

const URL_BASE = 'http://localhost:3000/webhooks/messenger';
const PAGE_ID = '106000000000001';

// Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the App Secret>
function sign(payload: string, secret: string = APP_SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function body(item: Record<string, unknown>, key = 'messaging'): string {
  return JSON.stringify({
    object: 'page',
    entry: [
      {
        id: PAGE_ID,
        time: 1458692752478,
        [key]: [{ sender: { id: 'PSID_1' }, recipient: { id: PAGE_ID }, timestamp: 1458692752478, ...item }],
      },
    ],
  });
}

function post(payload: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (signature !== undefined) headers['x-hub-signature-256'] = signature;
  return new NextRequest(URL_BASE, { method: 'POST', headers, body: payload });
}

const textBody = body({ message: { mid: 'mid.1457764197618:41d102a3e1ae206a38', text: 'hello, world!' } });

// Meta signs the escaped-unicode payload: "äöå" as "\u00e4\u00f6\u00e5".
const escapedBody = body({ message: { mid: 'm_1', text: 'PLACEHOLDER' } }).replace(
  'PLACEHOLDER',
  '\\u00e4\\u00f6\\u00e5'
);

describe('GET /webhooks/messenger (handshake)', () => {
  it('echoes hub.challenge when mode and token match', async () => {
    const res = await GET(
      new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=CHALLENGE_ACCEPTED`)
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('CHALLENGE_ACCEPTED');
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

describe('POST /webhooks/messenger (signature verification)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid signature', async () => {
    expect((await POST(post(textBody, sign(textBody)))).status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    expect((await POST(post(textBody, 'sha256=' + sign(textBody).slice(7).toUpperCase()))).status).toBe(200);
  });

  it('verifies any content type', async () => {
    expect((await POST(post(textBody, sign(textBody), 'text/plain'))).status).toBe(200);
  });

  it('verifies the escaped-unicode bytes Meta signs', async () => {
    expect((await POST(post(escapedBody, sign(escapedBody)))).status).toBe(200);
  });

  it('rejects a signature computed over the decoded (re-serialized) payload', async () => {
    const decoded = JSON.stringify(JSON.parse(escapedBody));
    expect(decoded).toContain('äöå');
    expect((await POST(post(escapedBody, sign(decoded)))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await POST(post(textBody))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await POST(post(textBody, sign(textBody, 'other_secret')))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await POST(post(textBody.replace('hello', 'HELLO'), sign(textBody)))).status).toBe(401);
  });

  it('rejects a header without the sha256= prefix', async () => {
    expect((await POST(post(textBody, sign(textBody).slice(7)))).status).toBe(401);
  });

  it('rejects the legacy sha1= prefix', async () => {
    expect((await POST(post(textBody, 'sha1=' + sign(textBody).slice(7)))).status).toBe(401);
  });

  it('rejects a short, long or non-hex digest instead of truncating it', async () => {
    const digest = sign(textBody).slice(7);
    expect((await POST(post(textBody, 'sha256=' + digest.slice(0, 40)))).status).toBe(401);
    expect((await POST(post(textBody, 'sha256=' + digest.slice(0, 62) + 'zz'))).status).toBe(401);
    expect((await POST(post(textBody, 'sha256=' + digest + 'ab'))).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await POST(post('not json', sign('not json'), 'text/plain'))).status).toBe(400);
  });

  it('returns 400 for a validly signed non-object JSON body', async () => {
    expect((await POST(post('[1]', sign('[1]')))).status).toBe(400);
  });
});

describe('event handling', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['messages', { message: { mid: 'm_1', text: 'hi' } }],
    ['messages (quick reply)', { message: { mid: 'm_1', text: 'Red', quick_reply: { payload: 'RED' } } }],
    ['message_echoes', { message: { is_echo: true, app_id: 1517776481860111, mid: 'm_2', text: 'hi' } }],
    ['messaging_postbacks', { postback: { mid: 'm_3', title: 'Get Started', payload: 'GET_STARTED' } }],
    ['message_reads', { read: { watermark: 1458668856253 } }],
    ['message_deliveries', { delivery: { mids: ['mid.1'], watermark: 1458668856253 } }],
    ['message_reactions', { reaction: { reaction: 'love', emoji: '❤️', action: 'react', mid: 'm_1' } }],
    ['messaging_optins', { optin: { type: 'notification_messages', notification_messages_token: 'TOKEN' } }],
    ['messaging_referrals', { referral: { ref: 'promo', source: 'ADS', type: 'OPEN_THREAD' } }],
    ['message_edits', { message_edit: { mid: 'm_1', text: 'edited', num_edit: 1 } }],
    ['messaging_account_linking', { account_linking: { status: 'unlinked' } }],
  ];

  it.each(cases)('handles %s', async (_name, item) => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload = body(item);
    expect((await POST(post(payload, sign(payload)))).status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).not.toMatch(/Unhandled|Ignoring/);
    spy.mockRestore();
  });

  it('handles standby-channel events', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload = body({ read: { watermark: 5 } }, 'standby');
    expect((await POST(post(payload, sign(payload)))).status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).toMatch(/read messages up to 5/);
    spy.mockRestore();
  });

  it('acknowledges unknown events', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload = body({ something_new: {} });
    expect((await POST(post(payload, sign(payload)))).status).toBe(200);
    spy.mockRestore();
  });
});
