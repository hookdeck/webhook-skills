const request = require('supertest');
const crypto = require('crypto');

process.env.PRIVE_WEBHOOK_SECRET = 'test_prive_secret_token';

const { app, verifyPriveSignature, TOPICS } = require('../src/index');

const secret = process.env.PRIVE_WEBHOOK_SECRET;

// Prive: bare base64 HMAC-SHA256 of the raw body
function sign(payload, key = secret) {
  return crypto.createHmac('sha256', key).update(payload).digest('base64');
}

describe('verifyPriveSignature', () => {
  const payload = Buffer.from('{"id":"sub_123"}');

  it('accepts a valid signature', () => {
    expect(verifyPriveSignature(payload, sign(payload), secret)).toBe(true);
  });

  it('rejects a missing signature', () => {
    expect(verifyPriveSignature(payload, undefined, secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyPriveSignature(payload, sign(payload, 'wrong'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = sign(payload);
    expect(verifyPriveSignature(Buffer.from('{"id":"sub_999"}'), sig, secret)).toBe(false);
  });

  it('rejects a hex digest', () => {
    const hex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyPriveSignature(payload, hex, secret)).toBe(false);
  });

  it('rejects trailing junk after a valid base64 digest', () => {
    expect(verifyPriveSignature(payload, `${sign(payload)}AAAA`, secret)).toBe(false);
  });

  it('rejects a non-ASCII header without throwing', () => {
    expect(verifyPriveSignature(payload, 'ünïcode', secret)).toBe(false);
  });

  it('is not prefixed with sha256=', () => {
    expect(verifyPriveSignature(payload, `sha256=${sign(payload)}`, secret)).toBe(false);
  });
});

describe('POST /webhooks/prive', () => {
  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({ id: 'sub_123' });
    const res = await request(app)
      .post('/webhooks/prive')
      .set('Content-Type', 'application/json')
      .set('x-prive-hmac-sha256', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('verifies any content type', async () => {
    const payload = '{"id":"sub_123"}';
    const res = await request(app)
      .post('/webhooks/prive')
      .set('Content-Type', 'text/plain')
      .set('x-prive-hmac-sha256', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('returns 401 for a missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/prive')
      .set('Content-Type', 'application/json')
      .send('{"id":"sub_123"}');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/prive')
      .set('Content-Type', 'application/json')
      .set('x-prive-hmac-sha256', 'invalid')
      .send('{"id":"sub_123"}');
    expect(res.status).toBe(401);
  });

  it('returns 401 (not 500) for a non-ASCII signature header', async () => {
    const res = await request(app)
      .post('/webhooks/prive')
      .set('Content-Type', 'application/json')
      .set('x-prive-hmac-sha256', Buffer.from('ünï', 'utf8').toString('latin1'))
      .send('{"id":"sub_123"}');
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const payload = 'not json';
    const res = await request(app)
      .post('/webhooks/prive')
      .set('Content-Type', 'text/plain')
      .set('x-prive-hmac-sha256', sign(payload))
      .send(payload);
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/prive/:topic', () => {
  it.each(Object.keys(TOPICS))('accepts a signed %s webhook', async (slug) => {
    const payload = JSON.stringify({ id: 'abc' });
    const res = await request(app)
      .post(`/webhooks/prive/${slug}`)
      .set('Content-Type', 'application/json')
      .set('x-prive-hmac-sha256', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('maps slugs to the documented topics', () => {
    expect(Object.values(TOPICS).sort()).toEqual(
      [
        'subscriptions/created',
        'subscriptions/line_removed',
        'subscriptions/status/updated',
        'orders/created',
        'billingAttempts/created',
        'billingAttempts/success',
        'billingAttempts/failed',
        'paymentMethod/updated',
        'subscriptionActivities/created',
        'subscription/customAttributes/updated',
      ].sort()
    );
  });

  it('returns 404 for an unknown topic', async () => {
    const payload = '{}';
    const res = await request(app)
      .post('/webhooks/prive/nope')
      .set('x-prive-hmac-sha256', sign(payload))
      .send(payload);
    expect(res.status).toBe(404);
  });

  it('returns 401 for a bad signature on a topic path', async () => {
    const res = await request(app)
      .post('/webhooks/prive/billing-attempts-failed')
      .set('Content-Type', 'application/json')
      .set('x-prive-hmac-sha256', 'bad')
      .send('{}');
    expect(res.status).toBe(401);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
