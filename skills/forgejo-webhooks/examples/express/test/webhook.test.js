const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FORGEJO_WEBHOOK_SECRET = 'test_forgejo_secret';

const { app, verifyForgejoWebhook } = require('../src/index');

// Trimmed from Forgejo's documented push example
const pushPayload = JSON.stringify({
  ref: 'refs/heads/develop',
  before: '28e1879d029cb852e4844d9c718537df08844e03',
  after: 'bffeb74224043ba2feb48d137756c8a9331c449a',
  commits: [{ id: 'bffeb74224043ba2feb48d137756c8a9331c449a', message: 'Webhooks Yay!' }],
  repository: { id: 140, name: 'webhooks', full_name: 'forgejo/webhooks' },
  pusher: { id: 1, login: 'forgejo' },
  sender: { id: 1, login: 'forgejo' },
});

// Forgejo's X-Forgejo-Signature is the bare hex HMAC-SHA256 of the body
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function send(event, body, { contentType = 'application/json', signature } = {}) {
  const sig = signature === undefined ? sign(body, process.env.FORGEJO_WEBHOOK_SECRET) : signature;
  return request(app)
    .post('/webhooks/forgejo')
    .set('Content-Type', contentType)
    .set('X-Forgejo-Signature', sig)
    .set('X-Forgejo-Event-Type', event)
    .set('X-Forgejo-Delivery', 'test-delivery-id')
    .send(body);
}

describe('Forgejo Webhook Endpoint', () => {
  const secret = process.env.FORGEJO_WEBHOOK_SECRET;

  describe('verifyForgejoWebhook', () => {
    const payload = Buffer.from('{"action":"opened"}');

    it('returns true for a valid signature', () => {
      expect(verifyForgejoWebhook(payload, sign(payload, secret), secret)).toBe(true);
    });

    it('accepts an uppercase hex signature', () => {
      expect(verifyForgejoWebhook(payload, sign(payload, secret).toUpperCase(), secret)).toBe(true);
    });

    it('returns false for a wrong-secret signature', () => {
      expect(verifyForgejoWebhook(payload, sign(payload, 'wrong_secret'), secret)).toBe(false);
    });

    it.each([
      ['undefined', undefined],
      ['empty', ''],
      ['too short', 'deadbeef'],
      ['non-hex', 'z'.repeat(64)],
      ['sha256= prefixed', `sha256=${'a'.repeat(64)}`],
      ['padded', ` ${'a'.repeat(63)}`],
    ])('returns false for a %s signature', (_name, sig) => {
      expect(verifyForgejoWebhook(payload, sig, secret)).toBe(false);
    });

    it('returns false when no secret is configured', () => {
      expect(verifyForgejoWebhook(payload, '', '')).toBe(false);
      expect(verifyForgejoWebhook(payload, sign(payload, ''), '')).toBe(false);
    });

    it('verifies raw bytes that are not valid UTF-8 text', () => {
      const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
      expect(verifyForgejoWebhook(bytes, sign(bytes, secret), secret)).toBe(true);
    });
  });

  describe('POST /webhooks/forgejo', () => {
    it('returns 401 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/forgejo')
        .set('Content-Type', 'application/json')
        .set('X-Forgejo-Event-Type', 'push')
        .send(pushPayload);

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 401 for an empty signature', async () => {
      const response = await send('push', pushPayload, { signature: '' });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a malformed signature', async () => {
      const response = await send('push', pushPayload, { signature: 'deadbeef' });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a signature made with the wrong secret', async () => {
      const response = await send('push', pushPayload, { signature: sign(pushPayload, 'wrong_secret') });
      expect(response.status).toBe(401);
    });

    it('returns 401 when the body was changed after signing', async () => {
      const response = await send('push', pushPayload.replace('develop', 'main'), {
        signature: sign(pushPayload, secret),
      });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a form-encoded body (signature covers the JSON payload, not the body)', async () => {
      const json = pushPayload;
      const form = `payload=${encodeURIComponent(json)}`;
      const response = await send('push', form, {
        contentType: 'application/x-www-form-urlencoded',
        signature: sign(json, secret),
      });
      expect(response.status).toBe(401);
    });

    it.each([
      ['push', JSON.parse(pushPayload)],
      ['pull_request', { action: 'opened', number: 1, pull_request: { title: 'Test PR' } }],
      ['issues', { action: 'opened', issue: { number: 1, title: 'Test Issue' } }],
      ['issue_comment', { action: 'created', issue: { number: 1 }, comment: { user: { login: 'forgejo' } } }],
      ['pull_request_comment', { action: 'created', issue: { number: 2 }, comment: { user: { login: 'forgejo' } } }],
      ['create', { ref_type: 'branch', ref: 'feature' }],
      ['delete', { ref_type: 'branch', ref: 'feature' }],
      ['release', { action: 'published', release: { tag_name: 'v1.0.0' } }],
      ['issue_assign', { action: 'assigned', issue: { number: 1 } }],
    ])('returns 200 for a valid %s event', async (event, payload) => {
      const response = await send(event, JSON.stringify(payload));
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('verifies any content type by reading the raw body', async () => {
      const response = await send('push', pushPayload, { contentType: 'text/plain' });
      expect(response.status).toBe(200);
    });

    it('returns 400 for a validly signed body that is not JSON', async () => {
      const response = await send('push', 'not json');
      expect(response.status).toBe(400);
    });
  });
});
