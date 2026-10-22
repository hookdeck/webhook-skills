const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.DOPPLER_WEBHOOK_SECRET = 'test_doppler_secret';

const { app, verifyDopplerWebhook } = require('../src/index');

/**
 * Generate a valid Doppler signature for testing (sha256=<hex> of the raw body)
 */
function generateDopplerSignature(payload, secret) {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

const defaultPayload = {
  type: 'config.secrets.update',
  config: { name: 'dev', root: true, environment: 'dev', project: 'backend' },
  project: { id: 'backend', slug: 'backend', name: 'backend' },
  workplace: { id: '9f0c0c0d5d4e240ce26e', name: 'My Workplace' },
  diff: { added: ['FOO'], removed: ['BAR'], updated: ['BAZ'] },
};

describe('Doppler Webhook Endpoint', () => {
  const secret = process.env.DOPPLER_WEBHOOK_SECRET;

  describe('verifyDopplerWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"type":"config.secrets.update"}');
      const signature = generateDopplerSignature(payload, secret);

      expect(verifyDopplerWebhook(payload, signature, secret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"type":"config.secrets.update"}');

      expect(verifyDopplerWebhook(payload, 'sha256=invalid', secret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"type":"config.secrets.update"}');

      expect(verifyDopplerWebhook(payload, undefined, secret)).toBe(false);
    });

    it('should return false when no secret is configured', () => {
      const payload = Buffer.from('{}');
      const signature = generateDopplerSignature(payload, secret);

      expect(verifyDopplerWebhook(payload, signature, undefined)).toBe(false);
    });

    it('should verify the raw bytes, not re-serialized JSON', () => {
      // Whitespace and key order differ from JSON.stringify output
      const payload = Buffer.from('{ "type" : "config.secrets.update",  "diff": {} }');
      const signature = generateDopplerSignature(payload, secret);

      expect(verifyDopplerWebhook(payload, signature, secret)).toBe(true);
    });
  });

  describe('POST /webhooks/doppler', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/doppler')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(defaultPayload));

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/doppler')
        .set('Content-Type', 'application/json')
        .set('X-Doppler-Signature', 'sha256=invalid')
        .send(JSON.stringify(defaultPayload));

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid config.secrets.update', async () => {
      const payload = JSON.stringify(defaultPayload);

      const response = await request(app)
        .post('/webhooks/doppler')
        .set('Content-Type', 'application/json')
        .set('X-Doppler-Signature', generateDopplerSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should verify a custom payload sent with another content type', async () => {
      const payload = '{"text": "secrets changed"}';

      const response = await request(app)
        .post('/webhooks/doppler')
        .set('Content-Type', 'text/plain')
        .set('X-Doppler-Signature', generateDopplerSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should verify pretty-printed JSON that JSON.stringify would change', async () => {
      const payload = JSON.stringify(defaultPayload, null, 4);

      const response = await request(app)
        .post('/webhooks/doppler')
        .set('Content-Type', 'application/json')
        .set('X-Doppler-Signature', generateDopplerSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should return 400 for a validly signed non-JSON body', async () => {
      const payload = 'not json';

      const response = await request(app)
        .post('/webhooks/doppler')
        .set('Content-Type', 'text/plain')
        .set('X-Doppler-Signature', generateDopplerSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(400);
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
