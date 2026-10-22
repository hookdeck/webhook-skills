const request = require('supertest');
const crypto = require('crypto');

// Sendbird master API token: an opaque 40-character hex string
const API_TOKEN = '0123456789abcdef0123456789abcdef01234567';
process.env.SENDBIRD_API_TOKEN = API_TOKEN;

const { app, verifySendbirdWebhook } = require('../src/index');

// Sendbird: hex HMAC-SHA256 of the raw body, keyed with the master API token
function sign(body, token = API_TOKEN) {
  return crypto.createHmac('sha256', token).update(body).digest('hex');
}

function event(category, extra = {}) {
  return JSON.stringify({
    category,
    sender: { user_id: 'Jeff', nickname: 'Oldies but goodies' },
    channel: { channel_url: 'sendbird_group_channel_1' },
    payload: { message: 'Hello 👋 café' },
    ...extra,
  });
}

function post(body, { signature = sign(body), contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/sendbird').set('Content-Type', contentType);
  if (signature) req.set('x-sendbird-signature', signature);
  return req.send(body);
}

describe('Sendbird webhook endpoint', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid group_channel:message_send webhook (non-ASCII body)', async () => {
    const res = await post(event('group_channel:message_send'));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Received group_channel:message_send event');
  });

  it.each([
    'group_channel:create',
    'group_channel:join',
    'group_channel:leave',
    'group_channel:message_send',
    'open_channel:message_send',
    'user:block',
    'user:unblock',
  ])('handles %s', async (category) => {
    const res = await post(event(category));
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(`Unhandled event: ${category}`);
  });

  it('acknowledges unhandled categories', async () => {
    const res = await post(event('group_channel:freeze_unfreeze'));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: group_channel:freeze_unfreeze');
  });

  it('verifies regardless of content type', async () => {
    const res = await post(event('group_channel:create'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(event('group_channel:create'), { signature: 'deadbeef' });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong token', async () => {
    const body = event('group_channel:create');
    const res = await post(body, { signature: sign(body, 'a_secondary_token') });
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(event('group_channel:create'), { signature: null });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = event('group_channel:create');
    const res = await post(body.replace('Jeff', 'Mallory'), { signature: sign(body) });
    expect(res.status).toBe(400);
  });

  it('rejects valid-signature invalid JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  it('serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('verifySendbirdWebhook', () => {
  it('accepts uppercase hex', () => {
    const body = Buffer.from('{"category":"user:block"}');
    expect(verifySendbirdWebhook(body, sign(body).toUpperCase(), API_TOKEN)).toBe(true);
  });

  it('rejects different-length and empty input', () => {
    const body = Buffer.from('{}');
    expect(verifySendbirdWebhook(body, 'abc', API_TOKEN)).toBe(false);
    expect(verifySendbirdWebhook(body, '', API_TOKEN)).toBe(false);
    expect(verifySendbirdWebhook(body, sign(body), '')).toBe(false);
  });
});
