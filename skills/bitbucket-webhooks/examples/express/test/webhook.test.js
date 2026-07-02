const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.BITBUCKET_WEBHOOK_SECRET = 'test_bitbucket_secret';

const { app, verifyBitbucketWebhook } = require('../src/index');

/**
 * Generate a valid Bitbucket signature for testing.
 * Matches Bitbucket's algorithm: HMAC-SHA256 hex over the raw body, sha256= prefix.
 */
function generateBitbucketSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

describe('Bitbucket Webhook Endpoint', () => {
  const webhookSecret = process.env.BITBUCKET_WEBHOOK_SECRET;

  describe('verifyBitbucketWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"pullrequest":{"id":1}}');
      const signature = generateBitbucketSignature(payload, webhookSecret);

      expect(verifyBitbucketWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"pullrequest":{"id":1}}');

      expect(verifyBitbucketWebhook(payload, 'sha256=invalid', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"pullrequest":{"id":1}}');

      expect(verifyBitbucketWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for malformed signature header', () => {
      const payload = Buffer.from('{"pullrequest":{"id":1}}');

      expect(verifyBitbucketWebhook(payload, 'not_a_valid_format', webhookSecret)).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const original = Buffer.from('{"pullrequest":{"id":1}}');
      const signature = generateBitbucketSignature(original, webhookSecret);
      const tampered = Buffer.from('{"pullrequest":{"id":999}}');

      expect(verifyBitbucketWebhook(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should match Bitbucket reference test vector', () => {
      // From Bitbucket docs
      const secret = "It's a Secret to Everybody";
      const body = Buffer.from('Hello World!');
      const expected =
        'sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9';

      expect(verifyBitbucketWebhook(body, expected, secret)).toBe(true);
    });
  });

  describe('POST /webhooks/bitbucket', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/bitbucket')
        .set('Content-Type', 'application/json')
        .set('X-Event-Key', 'repo:push')
        .set('X-Request-UUID', 'test-uuid')
        .send('{"push":{"changes":[]}}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ push: { changes: [] } });

      const response = await request(app)
        .post('/webhooks/bitbucket')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', 'sha256=invalid')
        .set('X-Event-Key', 'repo:push')
        .set('X-Request-UUID', 'test-uuid')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid repo:push', async () => {
      const payload = JSON.stringify({
        push: {
          changes: [
            { new: { name: 'main' }, commits: [{ message: 'Test commit' }] }
          ]
        }
      });
      const signature = generateBitbucketSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bitbucket')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .set('X-Event-Key', 'repo:push')
        .set('X-Request-UUID', 'test-uuid')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle pullrequest:created event', async () => {
      const payload = JSON.stringify({
        pullrequest: { id: 1, title: 'Test PR' }
      });
      const signature = generateBitbucketSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bitbucket')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .set('X-Event-Key', 'pullrequest:created')
        .set('X-Request-UUID', 'test-uuid')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle pullrequest:fulfilled event', async () => {
      const payload = JSON.stringify({
        pullrequest: { id: 1, title: 'Test PR' }
      });
      const signature = generateBitbucketSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bitbucket')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .set('X-Event-Key', 'pullrequest:fulfilled')
        .set('X-Request-UUID', 'test-uuid')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle issue:created event', async () => {
      const payload = JSON.stringify({
        issue: { id: 1, title: 'Test Issue' }
      });
      const signature = generateBitbucketSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bitbucket')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature', signature)
        .set('X-Event-Key', 'issue:created')
        .set('X-Request-UUID', 'test-uuid')
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
