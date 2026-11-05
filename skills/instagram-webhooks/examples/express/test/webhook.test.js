const request = require('supertest');
const crypto = require('crypto');

const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

process.env.INSTAGRAM_APP_SECRET = APP_SECRET;
process.env.INSTAGRAM_VERIFY_TOKEN = VERIFY_TOKEN;

const { app, verifyInstagramSignature } = require('../src/index');

// Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the app secret>
function sign(payload, secret = APP_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const ACCOUNT_ID = '17841405726653026';

function changeBody(field, value) {
  return JSON.stringify({
    object: 'instagram',
    entry: [{ id: ACCOUNT_ID, time: 1520622968, changes: [{ field, value }] }],
  });
}

function messagingBody(item, key = 'messaging') {
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

const commentBody = changeBody('comments', {
  id: '17865799348089039',
  from: { id: '1234567890', username: 'test_user' },
  text: 'Nice post',
  media: { id: '17918195224117851', media_product_type: 'FEED' },
});

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/instagram').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Hub-Signature-256', signature);
  return req.send(body);
}

function captureLogs() {
  return jest.spyOn(console, 'log').mockImplementation(() => {});
}

describe('GET /webhooks/instagram (handshake)', () => {
  it('echoes hub.challenge when mode and token match', async () => {
    const res = await request(app).get('/webhooks/instagram').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '1158201444',
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe('1158201444');
  });

  it('returns 403 on a wrong verify token', async () => {
    const res = await request(app).get('/webhooks/instagram').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'nope',
      'hub.challenge': '1158201444',
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when hub.verify_token is missing', async () => {
    const res = await request(app).get('/webhooks/instagram').query({ 'hub.mode': 'subscribe' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when hub.mode is not subscribe', async () => {
    const res = await request(app).get('/webhooks/instagram').query({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '1',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/instagram (signature verification)', () => {
  let spy;
  beforeEach(() => { spy = captureLogs(); });
  afterEach(() => spy.mockRestore());

  it('accepts a valid signature', async () => {
    expect((await post(commentBody, sign(commentBody))).status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const sig = 'sha256=' + sign(commentBody).slice(7).toUpperCase();
    expect((await post(commentBody, sig)).status).toBe(200);
  });

  it('verifies any content type', async () => {
    expect((await post(commentBody, sign(commentBody), 'text/plain')).status).toBe(200);
  });

  it('verifies the escaped-unicode bytes Meta signs', async () => {
    // Meta signs e.g. "äöå" as "\u00e4\u00f6\u00e5"; verify over those exact bytes.
    const body = changeBody('comments', { id: '1', text: 'PLACEHOLDER' }).replace(
      'PLACEHOLDER',
      '\\u00e4\\u00f6\\u00e5'
    );
    expect(body).toContain('\\u00e4');
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('rejects a signature computed over re-serialized (decoded) JSON', async () => {
    const body = changeBody('comments', { id: '1', text: 'PLACEHOLDER' }).replace(
      'PLACEHOLDER',
      '\\u00e4\\u00f6\\u00e5'
    );
    const reserialized = JSON.stringify(JSON.parse(body)); // now contains "äöå"
    expect(reserialized).not.toBe(body);
    expect((await post(body, sign(reserialized))).status).toBe(401);
  });

  it('verifies a raw UTF-8 body', async () => {
    const body = changeBody('comments', { id: '1', text: 'héllo 📸' });
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(commentBody, undefined)).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(commentBody, sign(commentBody, 'other_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(commentBody.replace('Nice', 'Mean'), sign(commentBody))).status).toBe(401);
  });

  it('rejects a header without the sha256= prefix', async () => {
    expect((await post(commentBody, sign(commentBody).slice(7))).status).toBe(401);
  });

  it('rejects the legacy sha1= prefix', async () => {
    expect((await post(commentBody, 'sha1=' + sign(commentBody).slice(7))).status).toBe(401);
  });

  it('rejects a short, long or non-hex digest instead of truncating it', async () => {
    const digest = sign(commentBody).slice(7);
    expect((await post(commentBody, 'sha256=' + digest.slice(0, 40))).status).toBe(401);
    expect((await post(commentBody, 'sha256=' + digest.slice(0, 62) + 'zz')).status).toBe(401);
    expect((await post(commentBody, 'sha256=' + digest + 'ab')).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await post('not json', sign('not json'), 'text/plain')).status).toBe(400);
  });

  it('returns 400 for a validly signed non-object JSON body', async () => {
    expect((await post('42', sign('42'))).status).toBe(400);
  });
});

describe('event handling', () => {
  const cases = [
    ['comments (Instagram Login)', changeBody('comments', { id: '1', from: { username: 'u' }, media: { id: '2' } })],
    ['comments (Facebook Login)', changeBody('comments', { comment_id: '1', from: { username: 'u' }, media: { id: '2' } })],
    ['live_comments', changeBody('live_comments', { comment_id: '1', from: { username: 'u' }, media: { id: '2' } })],
    ['mentions on media', changeBody('mentions', { media_id: '17918195224117851' })],
    ['mentions on comment', changeBody('mentions', { media_id: '1', comment_id: '2' })],
    ['story_insights', changeBody('story_insights', { media_id: '1', impressions: 44, reach: 40, exits: -1 })],
    ['messages', messagingBody({ message: { mid: 'MID', text: 'Hi' } })],
    ['messages with attachments', messagingBody({ message: { mid: 'MID', attachments: [{ type: 'ig_reel', payload: { url: 'https://x' } }] } })],
    ['message echo', messagingBody({ message: { mid: 'MID', text: 'Hi', is_echo: true } })],
    ['message deleted', messagingBody({ message: { mid: 'MID', is_deleted: true } })],
    ['handoff admin_text', messagingBody({ message: { admin_text: 'Needs a human', handoff_reason: 'human_requested' } })],
    ['message_reactions', messagingBody({ reaction: { mid: 'MID', action: 'react', reaction: 'love', emoji: '❤️' } })],
    ['messaging_postbacks', messagingBody({ postback: { mid: 'MID', title: 'Hours?', payload: 'HOURS' } })],
    ['messaging_referral', messagingBody({ referral: { ref: 'promo', source: 'https://ig.me/x', type: 'OPEN_THREAD' } })],
    ['messaging_seen', messagingBody({ read: { mid: 'MID' } })],
    ['message_edit', messagingBody({ message_edit: { mid: 'MID', text: 'edited', num_edit: 1 } })],
    ['standby message', messagingBody({ message: { mid: 'MID', text: 'Hi' } }, 'standby')],
  ];

  it.each(cases)('handles %s', async (_name, body) => {
    const spy = captureLogs();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).not.toMatch(/Unhandled|Ignoring/);
    spy.mockRestore();
  });

  it('handles a batch with several entries', async () => {
    const spy = captureLogs();
    const body = JSON.stringify({
      object: 'instagram',
      entry: [
        { id: ACCOUNT_ID, time: 1, changes: [{ field: 'mentions', value: { media_id: '1' } }] },
        { id: ACCOUNT_ID, time: 2, messaging: [{ sender: { id: 'a' }, recipient: { id: 'b' }, timestamp: 2, read: { mid: 'm' } }] },
      ],
    });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).toMatch(/Mention on media 1/);
    expect(spy.mock.calls.flat().join('\n')).toMatch(/seen by a/);
    spy.mockRestore();
  });

  it('accepts a notification wrapped in an array (as in some Meta samples)', async () => {
    const spy = captureLogs();
    const body = `[${commentBody}]`;
    expect((await post(body, sign(body))).status).toBe(200);
    spy.mockRestore();
  });

  it('acknowledges unknown fields and other objects', async () => {
    const spy = captureLogs();
    const unknown = changeBody('something_else', {});
    expect((await post(unknown, sign(unknown))).status).toBe(200);
    const page = JSON.stringify({ object: 'page', entry: [] });
    expect((await post(page, sign(page))).status).toBe(200);
    spy.mockRestore();
  });
});

describe('verifyInstagramSignature', () => {
  it('returns false when the secret is empty', () => {
    expect(verifyInstagramSignature(Buffer.from('x'), sign('x'), '')).toBe(false);
  });

  it('returns false for a non-string header', () => {
    expect(verifyInstagramSignature(Buffer.from('x'), ['sha256=00'], APP_SECRET)).toBe(false);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
