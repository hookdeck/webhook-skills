const request = require('supertest');
const crypto = require('crypto');

process.env.MAILGUN_WEBHOOK_SIGNING_KEY = 'test-signing-key';

const app = require('../src/index');

const SIGNING_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;

/**
 * Build a valid Mailgun-style signature object for a given (timestamp, token).
 * Mailgun signs the concatenation timestamp+token (no separator) with HMAC-SHA256.
 */
function buildSignature({ timestamp, token, signingKey = SIGNING_KEY } = {}) {
  const ts = timestamp || Math.floor(Date.now() / 1000).toString();
  const tk = token || crypto.randomBytes(25).toString('hex');
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(ts + tk)
    .digest('hex');
  return { timestamp: ts, token: tk, signature };
}

function buildPayload(event, extra = {}) {
  return {
    signature: buildSignature(),
    'event-data': {
      event,
      id: 'CPgfbmQMTCKtHW6uIWtuVe',
      timestamp: Date.now() / 1000,
      recipient: 'alice@example.com',
      ...extra,
    },
  };
}

describe('Mailgun Webhook Endpoint', () => {
  describe('POST /webhooks/mailgun', () => {
    it('returns 400 when signature object is missing', async () => {
      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send({ 'event-data': { event: 'delivered' } });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Missing signature/);
    });

    it('returns 400 for an invalid signature', async () => {
      const payload = {
        signature: {
          timestamp: '1700000000',
          token: 'abcdef0123456789abcdef0123456789abcdef0123456789ab',
          signature: 'deadbeef'.repeat(8),  // 64 hex chars but wrong
        },
        'event-data': { event: 'delivered', recipient: 'alice@example.com' },
      };

      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid signature');
    });

    it('returns 400 if signature was generated with a different key', async () => {
      const sig = buildSignature({ signingKey: 'WRONG-KEY' });
      const payload = {
        signature: sig,
        'event-data': { event: 'delivered', recipient: 'alice@example.com' },
      };

      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('returns 400 if timestamp/token fields are missing', async () => {
      const payload = {
        signature: { signature: 'abc' },  // missing timestamp and token
        'event-data': { event: 'delivered' },
      };

      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('returns 200 for a valid signature', async () => {
      const payload = buildPayload('delivered');

      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('returns 400 when event-data is missing', async () => {
      const payload = { signature: buildSignature() };

      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('handles all common event types', async () => {
      const events = [
        ['accepted', {}],
        ['rejected', { reject: { reason: 'Suppressed' } }],
        ['delivered', {}],
        ['failed', { severity: 'permanent', 'delivery-status': { code: 550 } }],
        ['failed', { severity: 'temporary', 'delivery-status': { code: 421 } }],
        ['opened', { ip: '1.2.3.4' }],
        ['clicked', { url: 'https://example.com', ip: '1.2.3.4' }],
        ['unsubscribed', {}],
        ['complained', {}],
        ['stored', { storage: { url: 'https://...', key: 'abc' } }],
        ['list_member_uploaded', { 'mailing-list': { address: 'list@x.com' } }],
        ['some.unknown.event', {}],
      ];

      for (const [event, extra] of events) {
        const payload = buildPayload(event, extra);
        const response = await request(app)
          .post('/webhooks/mailgun')
          .set('Content-Type', 'application/json')
          .send(payload);
        expect(response.status).toBe(200);
      }
    });

    it('rejects a tampered event-data with a valid signature unchanged (signature still valid because body is not signed)', async () => {
      // Note: Mailgun's signature only covers timestamp+token, not event-data.
      // So technically tampered event-data still verifies. This test documents that behavior.
      const sig = buildSignature();
      const payload = {
        signature: sig,
        'event-data': { event: 'delivered', recipient: 'attacker@example.com' },
      };

      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send(payload);

      // Signature is valid because timestamp+token were not modified
      expect(response.status).toBe(200);
    });

    it('verifies parent-signature when both signature and parent-signature are present', async () => {
      const parentKey = 'parent-account-signing-key';
      process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY = parentKey;

      const sig = buildSignature();
      const parentSignature = crypto
        .createHmac('sha256', parentKey)
        .update(sig.timestamp + sig.token)
        .digest('hex');

      const payload = {
        signature: { ...sig, 'parent-signature': parentSignature },
        'event-data': { event: 'delivered', recipient: 'alice@example.com' },
      };

      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);

      delete process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY;
    });

    it('rejects an invalid parent-signature when parent key is configured', async () => {
      process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY = 'parent-account-signing-key';

      const sig = buildSignature();
      const payload = {
        signature: { ...sig, 'parent-signature': 'a'.repeat(64) },
        'event-data': { event: 'delivered', recipient: 'alice@example.com' },
      };

      const response = await request(app)
        .post('/webhooks/mailgun')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/parent-signature/);

      delete process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY;
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
