const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables BEFORE importing the app
process.env.INTERCOM_CLIENT_SECRET = 'test_intercom_client_secret';

const { app, verifyIntercomWebhook } = require('../src/index');

/**
 * Generate a valid Intercom signature (sha1=<hex>) for testing.
 */
function generateIntercomSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha1', secret)
    .update(payload)
    .digest('hex');
  return `sha1=${signature}`;
}

describe('Intercom Webhook Endpoint', () => {
  const clientSecret = process.env.INTERCOM_CLIENT_SECRET;

  describe('verifyIntercomWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"topic":"ping","id":"notif_1"}');
      const signature = generateIntercomSignature(payload, clientSecret);

      expect(verifyIntercomWebhook(payload, signature, clientSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"topic":"ping"}');

      expect(verifyIntercomWebhook(payload, 'sha1=deadbeef', clientSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"topic":"ping"}');

      expect(verifyIntercomWebhook(payload, null, clientSecret)).toBe(false);
    });

    it('should return false for missing secret', () => {
      const payload = Buffer.from('{"topic":"ping"}');
      const signature = generateIntercomSignature(payload, clientSecret);

      expect(verifyIntercomWebhook(payload, signature, '')).toBe(false);
    });

    it('should reject tampered payload', () => {
      const original = Buffer.from('{"topic":"ping","id":"a"}');
      const tampered = Buffer.from('{"topic":"ping","id":"b"}');
      const signature = generateIntercomSignature(original, clientSecret);

      expect(verifyIntercomWebhook(tampered, signature, clientSecret)).toBe(false);
    });

    it('should reject wrong algorithm prefix', () => {
      const payload = Buffer.from('{"topic":"ping"}');
      const sig = crypto.createHmac('sha256', clientSecret).update(payload).digest('hex');

      expect(verifyIntercomWebhook(payload, `sha256=${sig}`, clientSecret)).toBe(false);
    });

    it('should reject malformed signature header', () => {
      const payload = Buffer.from('{"topic":"ping"}');

      expect(verifyIntercomWebhook(payload, 'not_a_valid_format', clientSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/intercom', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/intercom')
        .set('Content-Type', 'application/json')
        .send('{"topic":"ping"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ topic: 'ping', id: 'notif_x' });

      const response = await request(app)
        .post('/webhooks/intercom')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', 'sha1=deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should accept a valid ping notification', async () => {
      const payload = JSON.stringify({
        type: 'notification_event',
        topic: 'ping',
        id: 'notif_ping_1',
        data: { type: 'notification_event_data', item: {} }
      });
      const signature = generateIntercomSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/intercom')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle conversation.user.created', async () => {
      const payload = JSON.stringify({
        type: 'notification_event',
        topic: 'conversation.user.created',
        id: 'notif_conv_1',
        data: {
          type: 'notification_event_data',
          item: { type: 'conversation', id: 'conv_123' }
        }
      });
      const signature = generateIntercomSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/intercom')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle conversation.admin.replied', async () => {
      const payload = JSON.stringify({
        topic: 'conversation.admin.replied',
        id: 'notif_reply_1',
        data: { item: { type: 'conversation', id: 'conv_456' } }
      });
      const signature = generateIntercomSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/intercom')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle contact.user.created', async () => {
      const payload = JSON.stringify({
        topic: 'contact.user.created',
        id: 'notif_contact_1',
        data: { item: { type: 'contact', id: 'contact_789', email: 'a@b.test' } }
      });
      const signature = generateIntercomSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/intercom')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle ticket.created', async () => {
      const payload = JSON.stringify({
        topic: 'ticket.created',
        id: 'notif_ticket_1',
        data: { item: { type: 'ticket', id: 'ticket_42' } }
      });
      const signature = generateIntercomSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/intercom')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should accept an unknown topic without error', async () => {
      const payload = JSON.stringify({
        topic: 'some.future.topic',
        id: 'notif_unknown_1',
        data: { item: {} }
      });
      const signature = generateIntercomSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/intercom')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
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
