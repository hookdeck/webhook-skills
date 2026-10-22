const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.GITEA_WEBHOOK_SECRET = 'test_gitea_secret';

const { app, verifyGiteaWebhook } = require('../src/index');

// Gitea's X-Gitea-Signature is the bare hex HMAC-SHA256 of the raw body
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function send(event, body, { contentType = 'application/json', signature } = {}) {
  const sig = signature === undefined ? sign(body, process.env.GITEA_WEBHOOK_SECRET) : signature;
  return request(app)
    .post('/webhooks/gitea')
    .set('Content-Type', contentType)
    .set('X-Gitea-Signature', sig)
    .set('X-Gitea-Event', event)
    .set('X-Gitea-Delivery', 'test-delivery-id')
    .send(body);
}

describe('Gitea Webhook Endpoint', () => {
  const secret = process.env.GITEA_WEBHOOK_SECRET;

  describe('verifyGiteaWebhook', () => {
    const payload = Buffer.from('{"action":"opened"}');

    it('returns true for a valid signature', () => {
      expect(verifyGiteaWebhook(payload, sign(payload, secret), secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(verifyGiteaWebhook(payload, 'invalid', secret)).toBe(false);
    });

    it('returns false for a missing or empty signature', () => {
      expect(verifyGiteaWebhook(payload, undefined, secret)).toBe(false);
      expect(verifyGiteaWebhook(payload, '', secret)).toBe(false);
    });

    it('returns false when no secret is configured', () => {
      expect(verifyGiteaWebhook(payload, '', '')).toBe(false);
    });
  });

  describe('POST /webhooks/gitea', () => {
    it('returns 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/gitea')
        .set('Content-Type', 'application/json')
        .set('X-Gitea-Event', 'push')
        .send('{"ref":"refs/heads/main"}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 for an empty signature', async () => {
      const response = await send('push', '{"ref":"refs/heads/main"}', { signature: '' });
      expect(response.status).toBe(400);
    });

    it('returns 400 for an invalid signature', async () => {
      const response = await send('push', '{"ref":"refs/heads/main"}', { signature: 'deadbeef' });
      expect(response.status).toBe(400);
    });

    it('returns 400 for a signature made with the wrong secret', async () => {
      const body = '{"ref":"refs/heads/main"}';
      const response = await send('push', body, { signature: sign(body, 'wrong_secret') });
      expect(response.status).toBe(400);
    });

    it.each([
      ['push', { ref: 'refs/heads/main', head_commit: { message: 'Test commit' } }],
      ['pull_request', { action: 'opened', number: 1, pull_request: { title: 'Test PR' } }],
      ['issues', { action: 'opened', issue: { number: 1, title: 'Test Issue' } }],
      ['issue_comment', { action: 'created', issue: { number: 1 }, comment: { user: { login: 'octo' } } }],
      ['create', { ref: 'v1.0.0', ref_type: 'tag' }],
      ['delete', { ref: 'old-branch', ref_type: 'branch' }],
      ['release', { action: 'published', release: { tag_name: 'v1.0.0' } }],
      ['fork', { forkee: {} }],
    ])('returns 200 for a valid %s event', async (event, payload) => {
      const response = await send(event, JSON.stringify(payload));
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('verifies form-encoded deliveries over the raw body', async () => {
      const body = 'payload=' + encodeURIComponent(JSON.stringify({ ref: 'refs/heads/main' }));
      const response = await send('push', body, { contentType: 'application/x-www-form-urlencoded' });
      expect(response.status).toBe(200);
    });

    it('returns 400 for a validly signed body that is not JSON', async () => {
      const response = await send('push', 'not json');
      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid payload');
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
