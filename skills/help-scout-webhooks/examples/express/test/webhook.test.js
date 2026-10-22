const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.HELPSCOUT_WEBHOOK_SECRET = 'test_helpscout_secret';

const { app, verifyHelpScoutWebhook } = require('../src/index');

/**
 * Generate a valid Help Scout signature: base64 HMAC-SHA1 of the raw body
 */
function generateSignature(payload, secret) {
  return crypto.createHmac('sha1', secret).update(payload).digest('base64');
}

// Test vector from the Help Scout webhook documentation
const DOCS_SECRET = 'your secret key';
const DOCS_BODY =
  '{"ticket":{"id":"1","number":"2"},"customer":{"id":"1","fname":"Jackie","lname":"Chan","email":"jackie.chan@somewhere.com","emails":["jackie.chan@somewhere.com"]}}';
const DOCS_SIGNATURE = 'I1KlvGppYqvFTJgJ9jezdQMDiyI=';

describe('Help Scout Webhook Endpoint', () => {
  const secret = process.env.HELPSCOUT_WEBHOOK_SECRET;

  describe('verifyHelpScoutWebhook', () => {
    it('matches the signature from the Help Scout docs', () => {
      expect(generateSignature(DOCS_BODY, DOCS_SECRET)).toBe(DOCS_SIGNATURE);
      expect(verifyHelpScoutWebhook(Buffer.from(DOCS_BODY), DOCS_SIGNATURE, DOCS_SECRET)).toBe(true);
    });

    it('returns true for a valid signature', () => {
      const payload = Buffer.from('{"id":123}');
      const signature = generateSignature(payload, secret);
      expect(verifyHelpScoutWebhook(payload, signature, secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(verifyHelpScoutWebhook(Buffer.from('{"id":123}'), 'invalid_signature', secret)).toBe(false);
    });

    it('returns false for a signature signed with another secret', () => {
      const payload = Buffer.from('{"id":123}');
      const signature = generateSignature(payload, 'other_secret');
      expect(verifyHelpScoutWebhook(payload, signature, secret)).toBe(false);
    });

    it('returns false when the signature header is missing', () => {
      expect(verifyHelpScoutWebhook(Buffer.from('{}'), undefined, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/help-scout', () => {
    it('returns 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/help-scout')
        .set('Content-Type', 'application/json')
        .set('X-HelpScout-Event', 'convo.created')
        .send('{"id":123}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Missing signature header');
    });

    it('returns 400 for an invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/help-scout')
        .set('Content-Type', 'application/json')
        .set('X-HelpScout-Signature', 'invalid_signature')
        .set('X-HelpScout-Event', 'convo.created')
        .send('{"id":123}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    const events = [
      'convo.created',
      'convo.assigned',
      'convo.status',
      'convo.customer.reply.created',
      'convo.agent.reply.created',
      'customer.created',
      'customer.updated',
      'satisfaction.ratings',
    ];

    it.each(events)('accepts a signed %s event', async (event) => {
      const payload = JSON.stringify({ id: 123, subject: 'Help', status: 'active' });

      const response = await request(app)
        .post('/webhooks/help-scout')
        .set('Content-Type', 'application/json')
        .set('X-HelpScout-Signature', generateSignature(payload, secret))
        .set('X-HelpScout-Event', event)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('verifies regardless of content type', async () => {
      const payload = JSON.stringify({ id: 1 });

      const response = await request(app)
        .post('/webhooks/help-scout')
        .set('Content-Type', 'text/plain')
        .set('X-HelpScout-Signature', generateSignature(payload, secret))
        .set('X-HelpScout-Event', 'convo.created')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('verifies the docs test vector end to end', async () => {
      const response = await request(app)
        .post('/webhooks/help-scout')
        .set('Content-Type', 'application/json')
        .set('X-HelpScout-Signature', generateSignature(DOCS_BODY, secret))
        .set('X-HelpScout-Event', 'customer.created')
        .send(DOCS_BODY);

      expect(response.status).toBe(200);
    });

    it('returns 400 when the body is modified after signing', async () => {
      const response = await request(app)
        .post('/webhooks/help-scout')
        .set('Content-Type', 'application/json')
        .set('X-HelpScout-Signature', generateSignature('{"id":1}', secret))
        .set('X-HelpScout-Event', 'convo.created')
        .send('{"id":2}');

      expect(response.status).toBe(400);
    });

    it('returns 200 for an unhandled event with a valid signature', async () => {
      const payload = JSON.stringify({ id: 9 });

      const response = await request(app)
        .post('/webhooks/help-scout')
        .set('Content-Type', 'application/json')
        .set('X-HelpScout-Signature', generateSignature(payload, secret))
        .set('X-HelpScout-Event', 'tag.created')
        .send(payload);

      expect(response.status).toBe(200);
    });
  });
});
