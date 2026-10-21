const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FIVETRAN_WEBHOOK_SECRET = 'test_fivetran_secret';

const { app, verifyFivetranWebhook } = require('../src/index');

/**
 * Generate a Fivetran signature: HMAC-SHA256 hex of the raw body.
 * Fivetran's example uses uppercase hex; pass upper=false for lowercase.
 */
function generateFivetranSignature(payload, secret, upper = true) {
  const hex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return upper ? hex.toUpperCase() : hex;
}

function post(payload, signature) {
  const req = request(app)
    .post('/webhooks/fivetran')
    .set('Content-Type', 'application/json');
  if (signature) req.set('X-Fivetran-Signature-256', signature);
  return req.send(payload);
}

describe('Fivetran Webhook Endpoint', () => {
  const secret = process.env.FIVETRAN_WEBHOOK_SECRET;

  describe('verifyFivetranWebhook', () => {
    const payload = Buffer.from('{"event":"sync_end"}');

    it('accepts uppercase hex signature', () => {
      expect(verifyFivetranWebhook(payload, generateFivetranSignature(payload, secret), secret)).toBe(true);
    });

    it('accepts lowercase hex signature', () => {
      expect(verifyFivetranWebhook(payload, generateFivetranSignature(payload, secret, false), secret)).toBe(true);
    });

    it('rejects invalid signature', () => {
      expect(verifyFivetranWebhook(payload, 'ABCDEF', secret)).toBe(false);
    });

    it('rejects missing signature', () => {
      expect(verifyFivetranWebhook(payload, null, secret)).toBe(false);
    });

    it('rejects signature from a different secret', () => {
      expect(verifyFivetranWebhook(payload, generateFivetranSignature(payload, 'other'), secret)).toBe(false);
    });

    it('rejects a modified body', () => {
      const sig = generateFivetranSignature(payload, secret);
      expect(verifyFivetranWebhook(Buffer.from('{"event":"sync_start"}'), sig, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/fivetran', () => {
    it('returns 400 for missing signature', async () => {
      const response = await post(JSON.stringify({ event: 'sync_end' }));
      expect(response.status).toBe(400);
    });

    it('returns 400 for invalid signature', async () => {
      const response = await post(JSON.stringify({ event: 'sync_end' }), 'DEADBEEF');
      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it.each([
      ['sync_start', { event: 'sync_start', connector_id: 'c1', sync_id: 's1' }],
      ['sync_end', { event: 'sync_end', connector_id: 'c1', sync_id: 's1', data: { status: 'SUCCESSFUL' } }],
      ['status', { event: 'status', connector_id: 'c1', data: {} }],
      ['transformation_start', { event: 'transformation_start', data: {} }],
      ['transformation_succeeded', { event: 'transformation_succeeded', data: {} }],
      ['transformation_failed', { event: 'transformation_failed', data: {} }],
      ['connection_successful', { event: 'connection_successful', connector_id: 'c1', data: {} }],
      ['connection_failure', { event: 'connection_failure', connector_id: 'c1', data: {} }],
    ])('returns 200 for valid %s event', async (_name, body) => {
      const payload = JSON.stringify(body);
      const response = await post(payload, generateFivetranSignature(payload, secret));
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('accepts a lowercase signature', async () => {
      const payload = JSON.stringify({ event: 'sync_end', data: { status: 'FAILED' } });
      const response = await post(payload, generateFivetranSignature(payload, secret, false));
      expect(response.status).toBe(200);
    });

    it('returns 200 for unhandled events', async () => {
      const payload = JSON.stringify({ event: 'pause_connector', connector_id: 'c1' });
      const response = await post(payload, generateFivetranSignature(payload, secret));
      expect(response.status).toBe(200);
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      const payload = 'not json';
      const response = await post(payload, generateFivetranSignature(payload, secret));
      expect(response.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
