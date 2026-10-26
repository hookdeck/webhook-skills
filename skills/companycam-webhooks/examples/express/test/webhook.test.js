const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.COMPANYCAM_WEBHOOK_TOKEN = 'test_webhook_token';

const app = require('../src/index');

/**
 * Generate a valid CompanyCam signature for testing.
 * Base64(HMAC-SHA1(token, raw body))
 */
function generateSignature(payload, token) {
  return crypto.createHmac('sha1', token).update(Buffer.from(payload, 'utf8')).digest('base64');
}

const token = process.env.COMPANYCAM_WEBHOOK_TOKEN;

function event(eventType, payload = { id: '123' }) {
  return JSON.stringify({
    event_type: eventType,
    created_at: 1661361759,
    payload,
    webhook_id: 42,
  });
}

describe('CompanyCam Webhook Endpoint', () => {
  describe('POST /webhooks/companycam', () => {
    it('should return 401 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'application/json')
        .send(event('photo.created'));

      expect(response.status).toBe(401);
    });

    it('should return 401 for an invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'application/json')
        .set('X-CompanyCam-Signature', 'invalid')
        .send(event('photo.created'));

      expect(response.status).toBe(401);
    });

    it('should return 401 for a signature made with the wrong token', async () => {
      const body = event('photo.created');
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'application/json')
        .set('X-CompanyCam-Signature', generateSignature(body, 'other_token'))
        .send(body);

      expect(response.status).toBe(401);
    });

    it('should return 401 for a non-ASCII signature header', async () => {
      const body = event('photo.created');
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'application/json')
        .set('X-CompanyCam-Signature', Buffer.from('sigñ', 'utf8').toString('latin1'))
        .send(body);

      expect(response.status).toBe(401);
    });

    it('should return 401 when the body is tampered with', async () => {
      const signature = generateSignature(event('photo.created'), token);
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'application/json')
        .set('X-CompanyCam-Signature', signature)
        .send(event('photo.created', { id: '999' }));

      expect(response.status).toBe(401);
    });

    it.each([
      'project.created',
      'project.updated',
      'photo.created',
      'photo.updated',
      'comment.created',
      'document.created',
      'todo_list.completed',
      'task.completed',
    ])('should accept a valid %s event', async (eventType) => {
      const body = event(eventType);
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'application/json')
        .set('X-CompanyCam-Signature', generateSignature(body, token))
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should verify regardless of content type', async () => {
      const body = event('photo.created');
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'text/plain')
        .set('X-CompanyCam-Signature', generateSignature(body, token))
        .send(body);

      expect(response.status).toBe(200);
    });

    it('should accept unknown event types', async () => {
      const body = event('video.created');
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'application/json')
        .set('X-CompanyCam-Signature', generateSignature(body, token))
        .send(body);

      expect(response.status).toBe(200);
    });

    it('should return 400 for invalid JSON with a valid signature', async () => {
      const body = 'not json';
      const response = await request(app)
        .post('/webhooks/companycam')
        .set('Content-Type', 'application/json')
        .set('X-CompanyCam-Signature', generateSignature(body, token))
        .send(body);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('should return ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
