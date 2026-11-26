const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FLEXPORT_WEBHOOK_SECRET = 'test_flexport_secret';

const { app, verifyFlexportWebhook } = require('../src/index');

/**
 * Generate a valid Flexport signature for testing.
 * Mirrors Flexport: HMAC-SHA256 over the raw body, hex, prefixed "sha256=".
 */
function generateFlexportSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

describe('Flexport Webhook Endpoint', () => {
  const webhookSecret = process.env.FLEXPORT_WEBHOOK_SECRET;

  describe('verifyFlexportWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"type":"/shipment#created"}');
      const signature = generateFlexportSignature(payload, webhookSecret);

      expect(verifyFlexportWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"type":"/shipment#created"}');

      expect(verifyFlexportWebhook(payload, 'sha256=deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"type":"/shipment#created"}');

      expect(verifyFlexportWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"type":"/shipment#created","id":1}');
      const signature = generateFlexportSignature(original, webhookSecret);
      const tampered = Buffer.from('{"type":"/shipment#created","id":999}');

      expect(verifyFlexportWebhook(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"type":"/shipment#created"}');
      const signature = generateFlexportSignature(payload, webhookSecret);

      expect(verifyFlexportWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should return false for a malformed header (no sha256 prefix)', () => {
      const payload = Buffer.from('{"type":"/shipment#created"}');
      const bare = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      expect(verifyFlexportWebhook(payload, bare, webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/flexport', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/flexport')
        .set('Content-Type', 'application/json')
        .send('{"type":"/shipment#created"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ type: '/shipment#created' });

      const response = await request(app)
        .post('/webhooks/flexport')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', 'sha256=deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        type: '/shipment#created',
        id: 123,
        data: { resource: { id: 42 } }
      });
      const signature = generateFlexportSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/flexport')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle a /shipment_leg#departed event', async () => {
      const payload = JSON.stringify({
        type: '/shipment_leg#departed',
        id: 456,
        data: { location: { place: { name: 'Port of Shanghai' } }, shipment: { id: 100 } }
      });
      const signature = generateFlexportSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/flexport')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle an /invoice#invoice_payment_made event', async () => {
      const payload = JSON.stringify({
        type: '/invoice#invoice_payment_made',
        id: 789,
        data: { resource: { id: 5001 } }
      });
      const signature = generateFlexportSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/flexport')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should return 200 for an unhandled event type', async () => {
      const payload = JSON.stringify({ type: '/container_load_result#created', id: 999 });
      const signature = generateFlexportSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/flexport')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
