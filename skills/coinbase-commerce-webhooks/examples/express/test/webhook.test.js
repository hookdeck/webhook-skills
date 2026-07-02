const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app.
process.env.COINBASE_COMMERCE_WEBHOOK_SECRET = 'test_shared_secret';

const app = require('../src/index');

/**
 * Generate a valid Coinbase Commerce signature for testing.
 * Coinbase Commerce signs the raw body with HMAC-SHA256 (hex).
 */
function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Build a Coinbase Commerce webhook body with the event nested under `event`.
 */
function buildBody(type, chargeId = 'charge_123') {
  return JSON.stringify({
    id: 'notification_123',
    scheduled_for: '2023-08-30T19:29:20Z',
    event: {
      id: 'evt_123',
      resource: 'event',
      type,
      api_version: '2018-03-22',
      created_at: '2023-08-30T19:29:20Z',
      data: { id: chargeId, code: 'XA6G6ZFR' },
    },
  });
}

const webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;

describe('POST /webhooks/coinbase-commerce', () => {
  it('returns 400 when the signature header is missing', async () => {
    const response = await request(app)
      .post('/webhooks/coinbase-commerce')
      .set('Content-Type', 'application/json')
      .send(buildBody('charge:confirmed'));

    expect(response.status).toBe(400);
    expect(response.text).toContain('Missing X-CC-Webhook-Signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const response = await request(app)
      .post('/webhooks/coinbase-commerce')
      .set('Content-Type', 'application/json')
      .set('X-CC-Webhook-Signature', 'deadbeef')
      .send(buildBody('charge:confirmed'));

    expect(response.status).toBe(400);
    expect(response.text).toContain('Webhook Error');
  });

  it('returns 400 for a tampered payload', async () => {
    const original = buildBody('charge:confirmed', 'charge_original');
    const signature = generateSignature(original, webhookSecret);
    const tampered = buildBody('charge:confirmed', 'charge_tampered');

    const response = await request(app)
      .post('/webhooks/coinbase-commerce')
      .set('Content-Type', 'application/json')
      .set('X-CC-Webhook-Signature', signature)
      .send(tampered);

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const body = buildBody('charge:confirmed');
    const signature = generateSignature(body, webhookSecret);

    const response = await request(app)
      .post('/webhooks/coinbase-commerce')
      .set('Content-Type', 'application/json')
      .set('X-CC-Webhook-Signature', signature)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('handles all charge event types', async () => {
    const eventTypes = [
      'charge:created',
      'charge:pending',
      'charge:confirmed',
      'charge:failed',
      'charge:delayed',
      'charge:resolved',
      'charge:unknown',
    ];

    for (const type of eventTypes) {
      const body = buildBody(type);
      const signature = generateSignature(body, webhookSecret);

      const response = await request(app)
        .post('/webhooks/coinbase-commerce')
        .set('Content-Type', 'application/json')
        .set('X-CC-Webhook-Signature', signature)
        .send(body);

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
