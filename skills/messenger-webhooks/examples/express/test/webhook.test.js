const request = require('supertest');
const crypto = require('crypto');

const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

process.env.MESSENGER_APP_SECRET = APP_SECRET;
process.env.MESSENGER_VERIFY_TOKEN = VERIFY_TOKEN;

const { app, verifyMessengerSignature, eventType } = require('../src/index');

// Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the App Secret>
function sign(payload, secret = APP_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const PAGE_ID = '106000000000001';

function body(item, key = 'messaging') {
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

const textBody = body({ message: { mid: 'mid.1457764197618:41d102a3e1ae206a38', text: 'hello, world!' } });

// Meta signs the escaped-unicode payload: "äöå" as "\u00e4\u00f6\u00e5".
const escapedBody = body({ message: { mid: 'm_1', text: 'PLACEHOLDER' } }).replace(
  'PLACEHOLDER',
  '\\u00e4\\u00f6\\u00e5'
);

function post(payload, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/messenger').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Hub-Signature-256', signature);
  return req.send(payload);
}

describe('GET /webhooks/messenger (handshake)', () => {
  it('echoes hub.challenge when mode and token match', async () => {
    const res = await request(app).get('/webhooks/messenger').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'CHALLENGE_ACCEPTED',
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe('CHALLENGE_ACCEPTED');
  });

  it('returns 403 on a wrong verify token', async () => {
    const res = await request(app).get('/webhooks/messenger').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'nope',
      'hub.challenge': '1158201444',
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when hub.verify_token is missing', async () => {
    const res = await request(app).get('/webhooks/messenger').query({ 'hub.mode': 'subscribe' });
    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/messenger (signature verification)', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('accepts a valid signature', async () => {
    expect((await post(textBody, sign(textBody))).status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    expect((await post(textBody, 'sha256=' + sign(textBody).slice(7).toUpperCase())).status).toBe(200);
  });

  it('verifies any content type', async () => {
    expect((await post(textBody, sign(textBody), 'text/plain')).status).toBe(200);
  });

  it('verifies the escaped-unicode bytes Meta signs', async () => {
    expect(escapedBody).toContain('\\u00e4\\u00f6\\u00e5');
    expect((await post(escapedBody, sign(escapedBody))).status).toBe(200);
  });

  it('rejects a signature computed over the decoded (re-serialized) payload', async () => {
    const decoded = JSON.stringify(JSON.parse(escapedBody)); // "\u00e4" becomes "ä"
    expect(decoded).toContain('äöå');
    expect((await post(escapedBody, sign(decoded))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(textBody, undefined)).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(textBody, sign(textBody, 'other_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(textBody.replace('hello', 'HELLO'), sign(textBody))).status).toBe(401);
  });

  it('rejects a header without the sha256= prefix', async () => {
    expect((await post(textBody, sign(textBody).slice(7))).status).toBe(401);
  });

  it('rejects the legacy sha1= prefix', async () => {
    expect((await post(textBody, 'sha1=' + sign(textBody).slice(7))).status).toBe(401);
  });

  it('rejects a short, long or non-hex digest instead of truncating it', async () => {
    const digest = sign(textBody).slice(7);
    expect((await post(textBody, 'sha256=' + digest.slice(0, 40))).status).toBe(401);
    expect((await post(textBody, 'sha256=' + digest.slice(0, 62) + 'zz')).status).toBe(401);
    expect((await post(textBody, 'sha256=' + digest + 'ab')).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await post('not json', sign('not json'), 'text/plain')).status).toBe(400);
  });

  it('returns 400 for a validly signed non-object JSON body', async () => {
    expect((await post('[1]', sign('[1]'))).status).toBe(400);
  });
});

describe('event handling', () => {
  const cases = [
    ['messages', { message: { mid: 'm_1', text: 'hi' } }],
    ['messages', { message: { mid: 'm_1', attachments: [{ type: 'image', payload: { url: 'https://x' } }] } }],
    ['messages', { message: { mid: 'm_1', text: 'Red', quick_reply: { payload: 'RED' } } }],
    ['messages', { message: { admin_text: 'Ready to buy', handoff_reason: 'purchase_intent' } }],
    ['message_echoes', { message: { is_echo: true, app_id: 1517776481860111, mid: 'm_2', text: 'hi' } }],
    ['messaging_postbacks', { postback: { mid: 'm_3', title: 'Get Started', payload: 'GET_STARTED' } }],
    ['message_reads', { read: { watermark: 1458668856253 } }],
    ['message_deliveries', { delivery: { mids: ['mid.1458668856218:ed81099e15d3f4f233'], watermark: 1458668856253 } }],
    ['message_reactions', { reaction: { reaction: 'love', emoji: '❤️', action: 'react', mid: 'm_1' } }],
    ['messaging_optins', { optin: { type: 'notification_messages', notification_messages_token: 'TOKEN' } }],
    ['messaging_referrals', { referral: { ref: 'promo', source: 'SHORTLINK', type: 'OPEN_THREAD' } }],
    ['message_edits', { message_edit: { mid: 'm_1', text: 'edited', num_edit: 1 } }],
    ['messaging_account_linking', { account_linking: { status: 'linked', authorization_code: 'CODE' } }],
  ];

  it.each(cases)('handles %s', async (type, item) => {
    expect(eventType({ sender: { id: 'x' }, ...item })).toBe(type);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const payload = body(item);
    expect((await post(payload, sign(payload))).status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).not.toMatch(/Unhandled|Ignoring/);
    spy.mockRestore();
  });

  it('handles standby-channel events', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const payload = body({ message: { mid: 'm_1', text: 'hi' } }, 'standby');
    expect((await post(payload, sign(payload))).status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).toMatch(/Message m_1/);
    spy.mockRestore();
  });

  it('handles several entries in one POST', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const payload = JSON.stringify({
      object: 'page',
      entry: [
        { id: PAGE_ID, time: 1, messaging: [{ sender: { id: 'a' }, recipient: { id: PAGE_ID }, read: { watermark: 1 } }] },
        { id: PAGE_ID, time: 2, messaging: [{ sender: { id: 'b' }, recipient: { id: PAGE_ID }, read: { watermark: 2 } }] },
      ],
    });
    expect((await post(payload, sign(payload))).status).toBe(200);
    const out = spy.mock.calls.flat().join('\n');
    expect(out).toMatch(/a read messages up to 1/);
    expect(out).toMatch(/b read messages up to 2/);
    spy.mockRestore();
  });

  it('acknowledges unknown events and other objects', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const unknown = body({ something_new: {} });
    expect((await post(unknown, sign(unknown))).status).toBe(200);
    const ig = JSON.stringify({ object: 'instagram', entry: [] });
    expect((await post(ig, sign(ig))).status).toBe(200);
    spy.mockRestore();
  });
});

describe('verifyMessengerSignature', () => {
  it('returns false when the secret is empty', () => {
    expect(verifyMessengerSignature(Buffer.from('x'), sign('x'), '')).toBe(false);
  });

  it('returns false for a non-string header', () => {
    expect(verifyMessengerSignature(Buffer.from('x'), undefined, APP_SECRET)).toBe(false);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
