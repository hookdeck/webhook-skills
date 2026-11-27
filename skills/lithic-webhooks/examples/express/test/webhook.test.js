const request = require('supertest');
const crypto = require('crypto');

// Set test environment before importing the app.
// Lithic secrets are 'whsec_' + a base64-encoded key. The value below is a
// throwaway test key, not a real credential.
process.env.LITHIC_WEBHOOK_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
process.env.LITHIC_API_KEY = 'test-api-key';

const app = require('../src/index');

const WEBHOOK_SECRET = process.env.LITHIC_WEBHOOK_SECRET;

/**
 * Generate a valid Lithic (Standard Webhooks) signature for testing.
 *
 * Signed content is `{webhook-id}.{webhook-timestamp}.{payload}` and the HMAC
 * key is the base64-decoded portion of the secret after the `whsec_` prefix.
 */
function signPayload(payload, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const id = `msg_${crypto.randomBytes(6).toString('hex')}`;
  const ts = String(timestamp);
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${id}.${ts}.${payload}`)
    .digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${signature}`,
  };
}

const EVENT_TYPES = [
  'card.created',
  'card.updated',
  'card_transaction.updated',
  'payment_transaction.created',
  'payment_transaction.updated',
  'dispute.updated',
  'balance.updated',
  'three_ds_authentication.created',
  'account_holder.created', // unhandled -> still 200
];

describe('POST /webhooks/lithic', () => {
  it('returns 400 when signature headers are missing', async () => {
    const response = await request(app)
      .post('/webhooks/lithic')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ token: 'evt_1', event_type: 'card.created' });
    const response = await request(app)
      .post('/webhooks/lithic')
      .set('Content-Type', 'application/json')
      .set('webhook-id', 'msg_1')
      .set('webhook-timestamp', String(Math.floor(Date.now() / 1000)))
      .set('webhook-signature', 'v1,invalidsignature')
      .send(payload);

    expect(response.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ token: 'evt_1', event_type: 'card.created', amount: 100 });
    const headers = signPayload(original);
    const tampered = JSON.stringify({ token: 'evt_1', event_type: 'card.created', amount: 999 });

    const response = await request(app)
      .post('/webhooks/lithic')
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(tampered);

    expect(response.status).toBe(400);
  });

  it('returns 400 for a stale timestamp (replay protection)', async () => {
    const payload = JSON.stringify({ token: 'evt_1', event_type: 'card.created' });
    const staleTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const headers = signPayload(payload, WEBHOOK_SECRET, staleTs);

    const response = await request(app)
      .post('/webhooks/lithic')
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(payload);

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      event_type: 'card.created',
      card_token: '00000000-0000-0000-0000-000000000001',
      replacement_for: null,
    });
    const headers = signPayload(payload);

    const response = await request(app)
      .post('/webhooks/lithic')
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('handles every documented event type', async () => {
    for (const eventType of EVENT_TYPES) {
      const payload = JSON.stringify({
        event_type: eventType,
        token: 'obj_1',
      });
      const headers = signPayload(payload);

      const response = await request(app)
        .post('/webhooks/lithic')
        .set('Content-Type', 'application/json')
        .set(headers)
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
