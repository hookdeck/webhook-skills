const request = require('supertest');
const crypto = require('crypto');

// Fourthwall shop secret keys are UUID-like strings, used as UTF-8 text
process.env.FOURTHWALL_WEBHOOK_SECRET = 'e3f93c7c-c92b-4b8f-a9b1-5b70e0891abc';

const { app, verifyFourthwallSignature } = require('../src/index');

const SECRET = process.env.FOURTHWALL_WEBHOOK_SECRET;

/**
 * Generate a valid Fourthwall signature: base64(HMAC-SHA256(secret, raw body))
 */
function sign(payload, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

function makeEvent(type, data = {}) {
  return JSON.stringify({
    testMode: false,
    id: 'weve_geAva6c1RAuyb9HQxbSlmA',
    webhookId: 'wcon_P-VkRfmJTBaC6_Tst22cew',
    shopId: 'sh_7ad0c438-beda-4779-a885-0dc325a755c1',
    type,
    apiVersion: 'V1_BETA',
    createdAt: '2023-07-12T15:05:11.078089+00:00',
    data,
  });
}

describe('verifyFourthwallSignature', () => {
  const payload = Buffer.from('{"id":"weve_1"}');

  it('returns true for a valid signature', () => {
    expect(verifyFourthwallSignature(payload, sign(payload), SECRET)).toBe(true);
  });

  it('returns false for a signature made with another secret', () => {
    expect(verifyFourthwallSignature(payload, sign(payload, 'other-secret'), SECRET)).toBe(false);
  });

  it('returns false for a tampered body', () => {
    const signature = sign(payload);
    expect(verifyFourthwallSignature(Buffer.from('{"id":"weve_2"}'), signature, SECRET)).toBe(false);
  });

  it('returns false for a missing or wrong-length signature', () => {
    expect(verifyFourthwallSignature(payload, undefined, SECRET)).toBe(false);
    expect(verifyFourthwallSignature(payload, 'short', SECRET)).toBe(false);
  });

  it('rejects a hex digest (Fourthwall uses base64)', () => {
    const hex = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    expect(verifyFourthwallSignature(payload, hex, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/fourthwall', () => {
  it('returns 400 for a missing signature', async () => {
    const response = await request(app)
      .post('/webhooks/fourthwall')
      .set('Content-Type', 'application/json')
      .send(makeEvent('ORDER_PLACED'));

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const response = await request(app)
      .post('/webhooks/fourthwall')
      .set('Content-Type', 'application/json')
      .set('X-Fourthwall-Hmac-SHA256', 'invalid_signature')
      .send(makeEvent('ORDER_PLACED'));

    expect(response.status).toBe(400);
  });

  it('returns 400 for an empty body', async () => {
    const response = await request(app)
      .post('/webhooks/fourthwall')
      .set('X-Fourthwall-Hmac-SHA256', sign(''));

    // An empty body with a matching signature fails JSON parsing, not verification
    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = makeEvent('ORDER_PLACED', { friendlyId: 'D3XZY7DR' });

    const response = await request(app)
      .post('/webhooks/fourthwall')
      .set('Content-Type', 'application/json')
      .set('X-Fourthwall-Hmac-SHA256', sign(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('verifies bodies sent with any content type', async () => {
    const payload = makeEvent('DONATION', { username: 'supporter' });

    const response = await request(app)
      .post('/webhooks/fourthwall')
      .set('Content-Type', 'text/plain')
      .set('X-Fourthwall-Hmac-SHA256', sign(payload))
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('verifies the exact bytes received, not re-serialized JSON', async () => {
    const payload = '{ "id": "weve_1",   "type": "DONATION", "data": {} }';

    const response = await request(app)
      .post('/webhooks/fourthwall')
      .set('Content-Type', 'application/json')
      .set('X-Fourthwall-Hmac-SHA256', sign(payload))
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('handles each known event type', async () => {
    const types = [
      'ORDER_PLACED',
      'ORDER_UPDATED',
      'GIFT_PURCHASE',
      'DONATION',
      'SUBSCRIPTION_PURCHASED',
      'SUBSCRIPTION_CHANGED',
      'SUBSCRIPTION_EXPIRED',
      'PRODUCT_CREATED',
      'PRODUCT_UPDATED',
      'NEWSLETTER_SUBSCRIBED', // not handled explicitly: still acknowledged
    ];

    for (const type of types) {
      const payload = makeEvent(type, { id: 'x' });
      const response = await request(app)
        .post('/webhooks/fourthwall')
        .set('Content-Type', 'application/json')
        .set('X-Fourthwall-Hmac-SHA256', sign(payload))
        .send(payload);

      expect(response.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
