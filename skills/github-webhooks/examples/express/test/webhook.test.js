const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.GITHUB_WEBHOOK_SECRET = 'test_github_secret';

const { app, verifyGitHubWebhook } = require('../src/index');

/**
 * Generate a valid GitHub signature for testing
 */
function generateGitHubSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

describe('GitHub Webhook Endpoint', () => {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  describe('verifyGitHubWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"action":"opened"}');
      const signature = generateGitHubSignature(payload, webhookSecret);
      
      expect(verifyGitHubWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"action":"opened"}');
      
      expect(verifyGitHubWebhook(payload, 'sha256=invalid', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"action":"opened"}');
      
      expect(verifyGitHubWebhook(payload, null, webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/github', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'test-delivery-id')
        .send('{"ref":"refs/heads/main"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ ref: 'refs/heads/main' });

      const response = await request(app)
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', 'sha256=invalid')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'test-delivery-id')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({ 
        ref: 'refs/heads/main',
        head_commit: { message: 'Test commit' }
      });
      const signature = generateGitHubSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'test-delivery-id')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle ping event', async () => {
      const payload = JSON.stringify({ zen: 'Test zen message' });
      const signature = generateGitHubSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'ping')
        .set('X-GitHub-Delivery', 'test-delivery-id')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle pull_request event', async () => {
      const payload = JSON.stringify({ 
        action: 'opened',
        number: 1,
        pull_request: { title: 'Test PR' }
      });
      const signature = generateGitHubSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'pull_request')
        .set('X-GitHub-Delivery', 'test-delivery-id')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle issues event', async () => {
      const payload = JSON.stringify({ 
        action: 'opened',
        issue: { number: 1, title: 'Test Issue' }
      });
      const signature = generateGitHubSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'issues')
        .set('X-GitHub-Delivery', 'test-delivery-id')
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
