const request = require('supertest');
const crypto = require('crypto');

// Bolt Signing Secret is an arbitrary raw string (used as-is, not decoded)
process.env.BOLT_SIGNING_SECRET = 'test_bolt_signing_secret';

const { app, verifyBoltWebhook } = require('../src/index');

// Bolt: base64(HMAC-SHA256(rawBody, signingSecret)) in X-Bolt-Hmac-Sha256
function sign(payload, secret = process.env.BOLT_SIGNING_SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

const SECRET = process.env.BOLT_SIGNING_SECRET;

describe('verifyBoltWebhook', () => {
  const body = Buffer.from('{"type":"payment"}');

  it('accepts a valid signature', () => {
    expect(verifyBoltWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a signature from the wrong secret', () => {
    expect(verifyBoltWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyBoltWebhook(Buffer.from('{"type":"void"}'), sign(body), SECRET)).toBe(false);
  });

  it('rejects garbage of a different length', () => {
    expect(verifyBoltWebhook(body, 'abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/bolt', () => {
  const post = (payload, signature) => {
    const r = request(app)
      .post('/webhooks/bolt')
      .set('Content-Type', 'application/json');
    if (signature) r.set('X-Bolt-Hmac-Sha256', signature);
    return r.send(payload);
  };

  it('returns 400 when the signature header is missing', async () => {
    const res = await post('{"type":"payment"}');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post('{"type":"payment"}', 'invalid');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it.each([
    'pending', 'payment', 'auth', 'capture', 'credit', 'void',
    'failed_payment', 'rejected_irreversible', 'rejected_reversible',
    'risk_insights', 'newsletter_subscription',
  ])('accepts a signed %s transaction event with a JSON 200', async (type) => {
    const payload = JSON.stringify({
      type,
      object: 'transaction',
      data: { id: 'T1c3p4yBuVYJ9', reference: 'LBLJ-TWW7-R9VC', status: 'completed' },
    });
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed credit_card_deleted event', async () => {
    const payload = JSON.stringify({
      type: 'credit_card_deleted',
      object: 'credit_card',
      data: { user: { id: 'b2vghjk2v4c5fgdh3jak' }, credit_card: {} },
    });
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const payload = JSON.stringify({ type: 'subscription_created', object: 'subscription', data: {} });
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const payload = 'not json';
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(400);
  });
});
