const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.CALENDLY_WEBHOOK_SIGNING_KEY = 'test_signing_key';

const app = require('../src/index');

/**
 * Generate a valid Calendly signature header for testing.
 * Format: t=<timestamp>,v1=<hmac-sha256 hex of "{timestamp}.{payload}">
 */
function generateCalendlySignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('Calendly Webhook Endpoint', () => {
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

  describe('POST /webhooks/calendly', () => {
    it('should return 400 for missing signature header', async () => {
      const response = await request(app)
        .post('/webhooks/calendly')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toContain('Missing');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        event: 'invitee.created',
        payload: { email: 'jane@example.com' },
      });

      const response = await request(app)
        .post('/webhooks/calendly')
        .set('Content-Type', 'application/json')
        .set('Calendly-Webhook-Signature', 't=9999999999,v1=deadbeef')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should return 400 for tampered payload', async () => {
      const originalPayload = JSON.stringify({
        event: 'invitee.created',
        payload: { email: 'jane@example.com' },
      });
      const signature = generateCalendlySignature(originalPayload, signingKey);

      const tamperedPayload = JSON.stringify({
        event: 'invitee.created',
        payload: { email: 'attacker@example.com' },
      });

      const response = await request(app)
        .post('/webhooks/calendly')
        .set('Content-Type', 'application/json')
        .set('Calendly-Webhook-Signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 400 for a stale timestamp (replay protection)', async () => {
      const payload = JSON.stringify({
        event: 'invitee.created',
        payload: { email: 'jane@example.com' },
      });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s ago
      const signature = generateCalendlySignature(payload, signingKey, oldTimestamp);

      const response = await request(app)
        .post('/webhooks/calendly')
        .set('Content-Type', 'application/json')
        .set('Calendly-Webhook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        event: 'invitee.created',
        payload: { email: 'jane@example.com' },
      });
      const signature = generateCalendlySignature(payload, signingKey);

      const response = await request(app)
        .post('/webhooks/calendly')
        .set('Content-Type', 'application/json')
        .set('Calendly-Webhook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle all supported event types', async () => {
      const eventTypes = [
        'invitee.created',
        'invitee.canceled',
        'invitee_no_show.created',
        'routing_form_submission.created',
        'unknown.event',
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          event: eventType,
          payload: { email: 'jane@example.com', uri: 'https://api.calendly.com/x' },
        });
        const signature = generateCalendlySignature(payload, signingKey);

        const response = await request(app)
          .post('/webhooks/calendly')
          .set('Content-Type', 'application/json')
          .set('Calendly-Webhook-Signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('verifyCalendlySignature', () => {
    const { verifyCalendlySignature } = app;

    it('validates a correct signature', () => {
      const payload = JSON.stringify({ event: 'invitee.created' });
      const header = generateCalendlySignature(payload, signingKey);
      expect(verifyCalendlySignature(payload, header, signingKey)).toBe(true);
    });

    it('rejects a malformed header', () => {
      const payload = JSON.stringify({ event: 'invitee.created' });
      expect(verifyCalendlySignature(payload, 'not-a-valid-header', signingKey)).toBe(false);
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
