const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'my-secret-key';
process.env.WAHA_WEBHOOK_HMAC_KEY = SECRET;

const { app, verifyWahaSignature } = require('../src/index');

// Generate a real WAHA signature: hex HMAC-SHA512 of the raw body
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/waha')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

const message = JSON.stringify({
  id: 'evt_01hxyz',
  timestamp: 1741249702485,
  event: 'message',
  session: 'default',
  engine: 'WEBJS',
  payload: { id: 'true_11111111111@c.us_AAAA', from: '11111111111@c.us', body: 'Hi there!' },
});

describe('verifyWahaSignature', () => {
  const docBody = '{"event":"message","session":"default","engine":"WEBJS"}';
  const docSig =
    '208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89';

  it('matches the test vector from the WAHA docs', () => {
    expect(verifyWahaSignature(Buffer.from(docBody), docSig, 'my-secret-key', 'sha512')).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyWahaSignature(Buffer.from(docBody + ' '), docSig, 'my-secret-key')).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyWahaSignature(Buffer.from(docBody), undefined, 'my-secret-key')).toBe(false);
    expect(verifyWahaSignature(Buffer.from(docBody), docSig, undefined)).toBe(false);
  });

  it('rejects a signature of the wrong length', () => {
    expect(verifyWahaSignature(Buffer.from(docBody), 'abc', 'my-secret-key')).toBe(false);
  });

  it('rejects an unsupported algorithm', () => {
    expect(verifyWahaSignature(Buffer.from(docBody), docSig, 'my-secret-key', 'sha256')).toBe(false);
  });
});

describe('POST /webhooks/waha', () => {
  it('accepts a validly signed message event', async () => {
    const res = await post(message, {
      'X-Webhook-Hmac': sign(message),
      'X-Webhook-Hmac-Algorithm': 'sha512',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    'message',
    'message.any',
    'message.ack',
    'message.reaction',
    'session.status',
    'group.v2.join',
    'presence.update',
    'some.future.event',
  ])('accepts signed %s events', async (name) => {
    const body = JSON.stringify({ event: name, session: 'default', engine: 'WEBJS', payload: {} });
    const res = await post(body, { 'X-Webhook-Hmac': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/waha')
      .set('Content-Type', 'text/plain')
      .set('X-Webhook-Hmac', sign(message))
      .send(message);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(message);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(message, { 'X-Webhook-Hmac': sign(message, 'wrong-key') });
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const res = await post(message.replace('Hi there!', 'Hacked'), {
      'X-Webhook-Hmac': sign(message),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-sha512 algorithm header', async () => {
    const res = await post(message, {
      'X-Webhook-Hmac': sign(message),
      'X-Webhook-Hmac-Algorithm': 'sha256',
    });
    expect(res.status).toBe(400);
  });

  it('rejects signed but invalid JSON', async () => {
    const bad = '{not json';
    const res = await post(bad, { 'X-Webhook-Hmac': sign(bad) });
    expect(res.status).toBe(400);
  });
});
