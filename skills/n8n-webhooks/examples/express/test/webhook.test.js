const request = require('supertest');

// Set test environment variables before importing the app
process.env.N8N_WEBHOOK_SECRET = 'test_n8n_shared_secret_0123456789';
process.env.N8N_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.N8N_BASIC_AUTH_USER = 'n8n';
process.env.N8N_BASIC_AUTH_PASSWORD = 'test_basic_password';

const app = require('../src/index');
const { verifyN8nRequest } = require('../src/index');

const SECRET = process.env.N8N_WEBHOOK_SECRET;

// What an n8n HTTP Request node would send with Body Content Type = JSON
function samplePayload(event = 'order.created') {
  return {
    event,
    id: 'exec_1042',
    data: { order_id: 'ord_123', email: 'jane@example.com', workflow_name: 'Orders sync' }
  };
}

function basic(user, password) {
  return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
}

function post(body = JSON.stringify(samplePayload())) {
  return request(app)
    .post('/webhooks/n8n')
    .set('Content-Type', 'application/json')
    .send(body);
}

describe('n8n webhook endpoint', () => {
  describe('Header auth', () => {
    it('accepts the correct secret header', async () => {
      const res = await post().set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively (n8n lowercases headers by default)', async () => {
      const res = await post().set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const wrong = 'x'.repeat(SECRET.length);
      const res = await post().set('X-Webhook-Secret', wrong);
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('X-Webhook-Secret', 'short');
      expect(res.status).toBe(401);
    });
  });

  describe('Bearer auth', () => {
    it('accepts Authorization: Bearer <secret>', async () => {
      const res = await post().set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong bearer token', async () => {
      const res = await post().set('Authorization', 'Bearer not-the-secret');
      expect(res.status).toBe(401);
    });
  });

  describe('Basic auth', () => {
    it('accepts the configured username and password', async () => {
      const res = await post().set('Authorization', basic('n8n', 'test_basic_password'));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password', async () => {
      const res = await post().set('Authorization', basic('n8n', 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('admin', 'test_basic_password'));
      expect(res.status).toBe(401);
    });
  });

  describe('Request handling', () => {
    it('returns 401 when no credentials are sent', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('returns 400 for an invalid JSON body', async () => {
      const res = await post('{not json').set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2,3]').set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('handles every example event and unknown events', async () => {
      const events = ['lead.created', 'order.created', 'workflow.completed', 'workflow.failed', 'something.else'];
      for (const event of events) {
        const res = await post(JSON.stringify(samplePayload(event))).set('X-Webhook-Secret', SECRET);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifyN8nRequest', () => {
    it('rejects everything when no secret or basic credentials are configured', () => {
      expect(verifyN8nRequest({ 'x-webhook-secret': '' }, {})).toBe(false);
      expect(verifyN8nRequest({ authorization: 'Bearer ' }, {})).toBe(false);
      expect(verifyN8nRequest({ authorization: basic('', '') }, {})).toBe(false);
    });

    it('uses a custom header name', () => {
      const config = { N8N_WEBHOOK_SECRET: 's3cret', N8N_WEBHOOK_HEADER: 'X-N8N-Token' };
      expect(verifyN8nRequest({ 'x-n8n-token': 's3cret' }, config)).toBe(true);
      expect(verifyN8nRequest({ 'x-webhook-secret': 's3cret' }, config)).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
