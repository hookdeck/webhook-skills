const request = require('supertest');
const crypto = require('crypto');

const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

process.env.THREADS_APP_SECRET = APP_SECRET;
process.env.THREADS_VERIFY_TOKEN = VERIFY_TOKEN;

const { app, verifyThreadsSignature } = require('../src/index');

// Meta signs the raw body: sha256=<hex HMAC-SHA256 keyed with the app secret>
function sign(payload, secret = APP_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function notification(field, value, topic = 'moderate') {
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

const replyBody = notification('replies', {
  id: '8901234',
  username: 'test_username',
  text: 'Reply',
  media_type: 'TEXT_POST',
  replied_to: { id: '567890' },
  timestamp: '2024-08-07T10:33:16+0000',
});

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/threads').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Hub-Signature-256', signature);
  return req.send(body);
}

describe('GET /webhooks/threads (handshake)', () => {
  it('echoes hub.challenge when mode and token match', async () => {
    const res = await request(app).get('/webhooks/threads').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '1158201444',
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe('1158201444');
  });

  it('returns 403 on a wrong verify token', async () => {
    const res = await request(app).get('/webhooks/threads').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'nope',
      'hub.challenge': '1158201444',
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when hub.verify_token is missing', async () => {
    const res = await request(app).get('/webhooks/threads').query({ 'hub.mode': 'subscribe' });
    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/threads (signature verification)', () => {
  it('accepts a valid signature', async () => {
    const res = await post(replyBody, sign(replyBody));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const sig = 'sha256=' + sign(replyBody).slice(7).toUpperCase();
    const res = await post(replyBody, sig);
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await post(replyBody, sign(replyBody), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('verifies a body with non-ASCII characters', async () => {
    const body = notification('mentions', { id: '1', username: 'u', text: 'héllo 🧵' }, 'interaction');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(replyBody, undefined);
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(replyBody, sign(replyBody, 'other_secret'));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(replyBody.replace('Reply', 'Edited'), sign(replyBody));
    expect(res.status).toBe(401);
  });

  it('rejects a header without the sha256= prefix', async () => {
    const res = await post(replyBody, sign(replyBody).slice(7));
    expect(res.status).toBe(401);
  });

  it('rejects the legacy sha1= prefix', async () => {
    const res = await post(replyBody, 'sha1=' + sign(replyBody).slice(7));
    expect(res.status).toBe(401);
  });

  it('rejects a short or non-hex digest instead of truncating it', async () => {
    const digest = sign(replyBody).slice(7);
    expect((await post(replyBody, 'sha256=' + digest.slice(0, 40))).status).toBe(401);
    expect((await post(replyBody, 'sha256=' + digest.slice(0, 62) + 'zz')).status).toBe(401);
    expect((await post(replyBody, 'sha256=' + digest + 'ab')).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await post('not json', sign('not json'), 'text/plain');
    expect(res.status).toBe(400);
  });
});

describe('event handling', () => {
  const cases = [
    ['replies', { id: '1', username: 'u', replied_to: { id: '2' } }, 'moderate'],
    ['mentions', { id: '1', username: 'u' }, 'interaction'],
    ['publish', { id: '1', username: 'u' }, 'interaction'],
    ['delete', { id: '1', deleted_at: '2024-08-07T10:33:16+0000' }, 'moderate'],
  ];

  it.each(cases)('handles %s', async (field, value, topic) => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const body = notification(field, value, topic);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(spy.mock.calls.flat().join('\n')).not.toMatch(/Unhandled/);
    spy.mockRestore();
  });

  it('acknowledges unknown fields', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const body = notification('something_else', {});
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    spy.mockRestore();
  });
});

describe('verifyThreadsSignature', () => {
  it('returns false when the secret is empty', () => {
    expect(verifyThreadsSignature(Buffer.from('x'), sign('x'), '')).toBe(false);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
