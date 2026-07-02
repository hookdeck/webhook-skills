const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.JIRA_WEBHOOK_SECRET = 'test_jira_secret';

const { app, verifyJiraWebhook } = require('../src/index');

/**
 * Generate a valid Jira signature for testing.
 * Mirrors Jira Cloud: HMAC-SHA256 over the raw body, hex, `sha256=` prefix.
 */
function generateJiraSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

describe('Jira Webhook Endpoint', () => {
  const webhookSecret = process.env.JIRA_WEBHOOK_SECRET;

  describe('verifyJiraWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"webhookEvent":"jira:issue_created"}');
      const signature = generateJiraSignature(payload, webhookSecret);

      expect(verifyJiraWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"webhookEvent":"jira:issue_created"}');

      expect(verifyJiraWebhook(payload, 'sha256=deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"webhookEvent":"jira:issue_created"}');

      expect(verifyJiraWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for malformed header (no method prefix)', () => {
      const payload = Buffer.from('{"webhookEvent":"jira:issue_created"}');
      const bareHex = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      expect(verifyJiraWebhook(payload, bareHex, webhookSecret)).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const original = Buffer.from('{"webhookEvent":"jira:issue_created","key":"PROJ-1"}');
      const signature = generateJiraSignature(original, webhookSecret);
      const tampered = Buffer.from('{"webhookEvent":"jira:issue_created","key":"PROJ-999"}');

      expect(verifyJiraWebhook(tampered, signature, webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/jira', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .send('{"webhookEvent":"jira:issue_created"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ webhookEvent: 'jira:issue_created' });

      const response = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', 'sha256=invalid')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid jira:issue_created event', async () => {
      const payload = JSON.stringify({
        webhookEvent: 'jira:issue_created',
        issue: { key: 'PROJ-123', fields: { summary: 'Test issue' } }
      });
      const signature = generateJiraSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .set('X-Atlassian-Webhook-Identifier', 'test-delivery-id')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle jira:issue_updated event', async () => {
      const payload = JSON.stringify({
        webhookEvent: 'jira:issue_updated',
        issue: { key: 'PROJ-123', fields: { summary: 'Test issue' } },
        changelog: { items: [{ field: 'status', toString: 'In Progress' }] }
      });
      const signature = generateJiraSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/jira')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle comment_created event', async () => {
      const payload = JSON.stringify({
        webhookEvent: 'comment_created',
        issue: { key: 'PROJ-123', fields: { summary: 'Test issue' } },
        comment: { body: 'Nice work', author: { displayName: 'Jane Developer' } }
      });
      const signature = generateJiraSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/jira')
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
