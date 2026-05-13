const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.ORB_WEBHOOK_SECRET = 'test_webhook_secret';

const { app, verifyOrbSignature, isTimestampFresh } = require('../src/index');

const webhookSecret = process.env.ORB_WEBHOOK_SECRET;

/**
 * Generate a valid Orb signature for testing.
 * Signed content: `v1:{timestamp}:{payload}`
 */
function generateOrbSignature(payload, secret, timestamp = new Date().toISOString()) {
  const signedContent = `v1:${timestamp}:${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
  return { signature: `v1=${signature}`, timestamp };
}

describe('verifyOrbSignature', () => {
  it('accepts a valid signature', () => {
    const payload = '{"id":"evt_1","type":"invoice.issued"}';
    const { signature, timestamp } = generateOrbSignature(payload, webhookSecret);
    expect(verifyOrbSignature(payload, signature, timestamp, webhookSecret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(
      verifyOrbSignature(
        '{"id":"evt_1"}',
        'v1=deadbeef',
        new Date().toISOString(),
        webhookSecret
      )
    ).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyOrbSignature('{}', null, new Date().toISOString(), webhookSecret)).toBe(false);
    expect(verifyOrbSignature('{}', undefined, new Date().toISOString(), webhookSecret)).toBe(false);
  });

  it('rejects a missing timestamp', () => {
    expect(verifyOrbSignature('{}', 'v1=deadbeef', null, webhookSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = '{"id":"evt_1","amount":100}';
    const { signature, timestamp } = generateOrbSignature(original, webhookSecret);
    const tampered = '{"id":"evt_1","amount":999}';
    expect(verifyOrbSignature(tampered, signature, timestamp, webhookSecret)).toBe(false);
  });

  it('accepts a signature when the v1= prefix is omitted', () => {
    const payload = '{"id":"evt_1"}';
    const { signature, timestamp } = generateOrbSignature(payload, webhookSecret);
    const bare = signature.slice(3); // strip "v1="
    expect(verifyOrbSignature(payload, bare, timestamp, webhookSecret)).toBe(true);
  });
});

describe('isTimestampFresh', () => {
  it('accepts a current timestamp', () => {
    expect(isTimestampFresh(new Date().toISOString())).toBe(true);
  });

  it('rejects a timestamp older than the tolerance', () => {
    const old = new Date(Date.now() - 400 * 1000).toISOString(); // 400s ago
    expect(isTimestampFresh(old)).toBe(false);
  });

  it('rejects an unparseable timestamp', () => {
    expect(isTimestampFresh('not-a-date')).toBe(false);
  });
});

describe('POST /webhooks/orb', () => {
  it('returns 400 for missing signature headers', async () => {
    const response = await request(app)
      .post('/webhooks/orb')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(400);
    expect(response.text).toContain('Missing Orb signature headers');
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ id: 'evt_test_123', type: 'invoice.issued' });
    const response = await request(app)
      .post('/webhooks/orb')
      .set('Content-Type', 'application/json')
      .set('X-Orb-Signature', 'v1=invalid_signature')
      .set('X-Orb-Timestamp', new Date().toISOString())
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid signature');
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ id: 'evt_test', type: 'invoice.issued', amount: 100 });
    const { signature, timestamp } = generateOrbSignature(original, webhookSecret);
    const tampered = JSON.stringify({ id: 'evt_test', type: 'invoice.issued', amount: 999 });

    const response = await request(app)
      .post('/webhooks/orb')
      .set('Content-Type', 'application/json')
      .set('X-Orb-Signature', signature)
      .set('X-Orb-Timestamp', timestamp)
      .send(tampered);

    expect(response.status).toBe(400);
  });

  it('returns 400 for a stale timestamp', async () => {
    const payload = JSON.stringify({ id: 'evt_test', type: 'invoice.issued' });
    const staleTimestamp = new Date(Date.now() - 600 * 1000).toISOString();
    const { signature } = generateOrbSignature(payload, webhookSecret, staleTimestamp);

    const response = await request(app)
      .post('/webhooks/orb')
      .set('Content-Type', 'application/json')
      .set('X-Orb-Signature', signature)
      .set('X-Orb-Timestamp', staleTimestamp)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.text).toContain('Timestamp outside tolerance');
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      id: 'evt_valid',
      type: 'invoice.issued',
      properties: { invoice_id: 'invoice_01' },
    });
    const { signature, timestamp } = generateOrbSignature(payload, webhookSecret);

    const response = await request(app)
      .post('/webhooks/orb')
      .set('Content-Type', 'application/json')
      .set('X-Orb-Signature', signature)
      .set('X-Orb-Timestamp', timestamp)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('handles every documented event type', async () => {
    const eventTypes = [
      'customer.created',
      'customer.credit_balance_dropped',
      'subscription.created',
      'subscription.started',
      'subscription.ended',
      'subscription.plan_changed',
      'subscription.usage_exceeded',
      'invoice.issued',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'data_exports.transfer_success',
      'unknown.event.type',
    ];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({
        id: `evt_${eventType.replace(/\./g, '_')}`,
        type: eventType,
        properties: {},
      });
      const { signature, timestamp } = generateOrbSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/orb')
        .set('Content-Type', 'application/json')
        .set('X-Orb-Signature', signature)
        .set('X-Orb-Timestamp', timestamp)
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
