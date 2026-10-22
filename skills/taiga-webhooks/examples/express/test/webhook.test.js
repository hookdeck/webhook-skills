const request = require('supertest');
const crypto = require('crypto');

// Taiga's secret key is a free-form string chosen by the project admin
process.env.TAIGA_WEBHOOK_SECRET = 'taiga_test_secret_key';

const { app, verifyTaigaWebhook } = require('../src/index');

const secret = process.env.TAIGA_WEBHOOK_SECRET;

/**
 * Generate an X-TAIGA-WEBHOOK-SIGNATURE value the same way Taiga does:
 * hex(HMAC-SHA1(secret, rawBody))
 */
function generateTaigaSignature(payload, key) {
  return crypto.createHmac('sha1', key).update(payload).digest('hex');
}

function postSigned(payload, signature = generateTaigaSignature(payload, secret), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/taiga')
    .set('Content-Type', contentType)
    .set('X-TAIGA-WEBHOOK-SIGNATURE', signature)
    .send(payload);
}

const event = (type, action, data = { id: 139, subject: 'test user story' }) =>
  JSON.stringify({
    action,
    type,
    by: { id: 6, username: 'user1' },
    date: '2016-04-12T12:17:20.486Z',
    data,
    ...(action === 'change' ? { change: { comment: '', diff: {} } } : {}),
  });

describe('verifyTaigaWebhook', () => {
  const payload = Buffer.from(event('userstory', 'create'));

  it('accepts a valid signature', () => {
    expect(verifyTaigaWebhook(payload, generateTaigaSignature(payload, secret), secret)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyTaigaWebhook(payload, generateTaigaSignature(payload, secret).toUpperCase(), secret)).toBe(true);
  });

  it('rejects a signature made with another key', () => {
    expect(verifyTaigaWebhook(payload, generateTaigaSignature(payload, 'other'), secret)).toBe(false);
  });

  it('rejects a modified body', () => {
    const sig = generateTaigaSignature(payload, secret);
    expect(verifyTaigaWebhook(Buffer.from(payload + ' '), sig, secret)).toBe(false);
  });

  it('rejects a sha1= prefixed value (that is X-Hub-Signature format)', () => {
    expect(verifyTaigaWebhook(payload, `sha1=${generateTaigaSignature(payload, secret)}`, secret)).toBe(false);
  });

  it('rejects an HMAC-SHA256 signature', () => {
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyTaigaWebhook(payload, sig, secret)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyTaigaWebhook(payload, undefined, secret)).toBe(false);
    expect(verifyTaigaWebhook(payload, generateTaigaSignature(payload, secret), undefined)).toBe(false);
  });

  it('rejects a short signature without throwing', () => {
    expect(verifyTaigaWebhook(payload, 'abc', secret)).toBe(false);
  });
});

describe('POST /webhooks/taiga', () => {
  it.each([
    ['userstory', 'create'],
    ['userstory', 'change'],
    ['userstory', 'delete'],
    ['task', 'create'],
    ['task', 'change'],
    ['task', 'delete'],
    ['issue', 'create'],
    ['epic', 'change'],
    ['milestone', 'delete'],
    ['wikipage', 'create'],
  ])('accepts %s %s', async (type, action) => {
    const res = await postSigned(event(type, action));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the test event', async () => {
    const res = await postSigned(event('test', 'test', { test: 'test' }));
    expect(res.status).toBe(200);
  });

  it('accepts unknown events with 200', async () => {
    const res = await postSigned(event('swimlane', 'create'));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    const res = await postSigned(event('task', 'create'), undefined, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await postSigned(event('task', 'create'), 'deadbeef');
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/taiga')
      .set('Content-Type', 'application/json')
      .send(event('task', 'create'));
    expect(res.status).toBe(400);
  });

  it('rejects a body altered after signing', async () => {
    const body = event('task', 'create');
    const res = await postSigned(body.replace('139', '140'), generateTaigaSignature(body, secret));
    expect(res.status).toBe(400);
  });

  it('rejects a signed body that is not JSON', async () => {
    const res = await postSigned('not json');
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
