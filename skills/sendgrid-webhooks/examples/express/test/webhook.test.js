const request = require('supertest');
const crypto = require('crypto');

// Set test environment before requiring the app
process.env.NODE_ENV = 'test';

// Test webhook verification key (EC P-256 key for testing)
const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgpmQ3zf+bk6YSlk1D
P/KbVCTBI/BWszZDLaxJbhFsgHGhRANCAASLvm+bKJtz2V4nR78IX8A8ZEi3gQXK
96XBzIWdhjkj/ypkZVt/BfmpNG+AL94XiGSjxiV8IcNkDP//EScDI4BX
-----END PRIVATE KEY-----`;

const testPublicKey = `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEi75vmyibc9leJ0e/CF/APGRIt4EFyvelwcyFnYY5I/8qZGVbfwX5qTRvgC/eF4hko8YlfCHDZAz//xEnAyOAVw==`;

// Set test environment
process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = testPublicKey;

const { app } = require('../src/index');

describe('SendGrid Webhook Handler', () => {

  function generateSignature(payload, timestamp) {
    const signedContent = timestamp + payload;
    const sign = crypto.createSign('sha256');
    sign.update(signedContent);
    return sign.sign(testPrivateKey, 'base64');
  }

  describe('POST /webhooks/sendgrid', () => {
    it('should accept valid webhook with correct signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [
        {
          email: 'test@example.com',
          timestamp: parseInt(timestamp),
          event: 'delivered',
          sg_event_id: 'test-event-id',
          sg_message_id: 'test-message-id'
        }
      ];
      const payload = JSON.stringify(events);
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/sendgrid')
        .set('X-Twilio-Email-Event-Webhook-Signature', signature)
        .set('X-Twilio-Email-Event-Webhook-Timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should reject webhook with invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [{
        email: 'test@example.com',
        timestamp: parseInt(timestamp),
        event: 'delivered'
      }];
      const payload = JSON.stringify(events);

      const response = await request(app)
        .post('/webhooks/sendgrid')
        .set('X-Twilio-Email-Event-Webhook-Signature', 'invalid-signature')
        .set('X-Twilio-Email-Event-Webhook-Timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid signature');
    });

    it('should reject webhook with missing signature header', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [{
        email: 'test@example.com',
        timestamp: parseInt(timestamp),
        event: 'delivered'
      }];

      const response = await request(app)
        .post('/webhooks/sendgrid')
        .set('X-Twilio-Email-Event-Webhook-Timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(events);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing signature headers');
    });

    it('should reject webhook with missing timestamp header', async () => {
      const events = [{
        email: 'test@example.com',
        timestamp: Date.now(),
        event: 'delivered'
      }];

      const response = await request(app)
        .post('/webhooks/sendgrid')
        .set('X-Twilio-Email-Event-Webhook-Signature', 'some-signature')
        .set('Content-Type', 'application/json')
        .send(events);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing signature headers');
    });

    it('should handle multiple events in one webhook', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [
        {
          email: 'user1@example.com',
          timestamp: parseInt(timestamp),
          event: 'delivered',
          sg_event_id: 'event-1'
        },
        {
          email: 'user2@example.com',
          timestamp: parseInt(timestamp),
          event: 'bounce',
          sg_event_id: 'event-2',
          reason: 'Invalid email address'
        },
        {
          email: 'user3@example.com',
          timestamp: parseInt(timestamp),
          event: 'click',
          sg_event_id: 'event-3',
          url: 'https://example.com/link'
        }
      ];
      const payload = JSON.stringify(events);
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/sendgrid')
        .set('X-Twilio-Email-Event-Webhook-Signature', signature)
        .set('X-Twilio-Email-Event-Webhook-Timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should accept headers in lowercase', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [{
        email: 'test@example.com',
        timestamp: parseInt(timestamp),
        event: 'open'
      }];
      const payload = JSON.stringify(events);
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/sendgrid')
        .set('x-twilio-email-event-webhook-signature', signature)
        .set('x-twilio-email-event-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should reject invalid JSON payload', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = 'invalid-json';
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/sendgrid')
        .set('X-Twilio-Email-Event-Webhook-Signature', signature)
        .set('X-Twilio-Email-Event-Webhook-Timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid JSON payload');
    });
  });

  describe('GET /health', () => {
    it('should return health check status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});