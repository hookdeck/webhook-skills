const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.COURIER_WEBHOOK_SECRET = 'courier_test_secret';

const { app, verifyCourierWebhook } = require('../src/index');

const webhookSecret = process.env.COURIER_WEBHOOK_SECRET;

/**
 * Generate a valid Courier signature header for testing.
 * Signed content is `<timestamp_ms>.<rawBody>`, HMAC-SHA256 hex.
 */
function generateCourierSignature(payload, secret, timestamp = Date.now()) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},signature=${signature}`;
}

describe('verifyCourierWebhook', () => {
  it('accepts a valid signature', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const header = generateCourierSignature(payload, webhookSecret);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(verifyCourierWebhook('{}', undefined, webhookSecret)).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verifyCourierWebhook('{}', 'not-a-signature', webhookSecret)).toBe(false);
  });

  it('rejects an invalid signature', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const header = `t=${Date.now()},signature=deadbeef`;
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const header = generateCourierSignature(original, webhookSecret);
    const tampered = JSON.stringify({ type: 'message:updated', data: { id: 'HACKED' } });
    expect(verifyCourierWebhook(tampered, header, webhookSecret)).toBe(false);
  });

  it('rejects a stale timestamp', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const staleTs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const header = generateCourierSignature(payload, webhookSecret, staleTs);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('accepts a seconds-precision timestamp (defensive; Courier documents milliseconds)', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const seconds = Math.floor(Date.now() / 1000);
    const header = generateCourierSignature(payload, webhookSecret, seconds);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(true);
  });

  it('rejects a stale seconds-precision timestamp', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const staleSeconds = Math.floor(Date.now() / 1000) - 10 * 60; // 10 minutes ago
    const header = generateCourierSignature(payload, webhookSecret, staleSeconds);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const header = generateCourierSignature(payload, webhookSecret, 'not-a-timestamp');
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('matches Courier\'s documented JSON.stringify(body) form for an unmodified body', () => {
    // Courier documents the signed content as `${t}.${JSON.stringify(body)}`;
    // this skill signs `${t}.${rawBody}`. For a delivery we have not modified
    // the two inputs are byte-identical, so both produce the same digest.
    const body = { type: 'message:updated', data: { id: 'm1', status: 'DELIVERED' } };
    const rawBody = JSON.stringify(body);
    const timestamp = Date.now();
    const docsDigest = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${JSON.stringify(JSON.parse(rawBody))}`)
      .digest('hex');
    const header = `t=${timestamp},signature=${docsDigest}`;
    expect(verifyCourierWebhook(rawBody, header, webhookSecret)).toBe(true);
  });
});

describe('POST /webhooks/courier', () => {
  it('returns 400 for a missing signature', async () => {
    const response = await request(app)
      .post('/webhooks/courier')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const response = await request(app)
      .post('/webhooks/courier')
      .set('Content-Type', 'application/json')
      .set('courier-signature', `t=${Date.now()},signature=deadbeef`)
      .send(payload);

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({ type: 'message:updated', data: { id: 'm1', status: 'DELIVERED' } });
    const header = generateCourierSignature(payload, webhookSecret);

    const response = await request(app)
      .post('/webhooks/courier')
      .set('Content-Type', 'application/json')
      .set('courier-signature', header)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('handles all Courier event types', async () => {
    const eventTypes = [
      'message:updated',
      'notification:submitted',
      'notification:submission_canceled',
      'notification:published',
      'audiences:updated',
      'audiences:user:matched',
      'audiences:user:unmatched',
      'audiences:calculated',
      'unknown:event',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({ type, data: { id: 'obj_123' } });
      const header = generateCourierSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/courier')
        .set('Content-Type', 'application/json')
        .set('courier-signature', header)
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
