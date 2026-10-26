const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app.
// OpenRouter signing secrets are opaque strings used as-is (UTF-8) as the HMAC key.
process.env.OPENROUTER_WEBHOOK_SECRET = 'test_openrouter_signing_secret';

const app = require('../src/index');

const webhookSecret = process.env.OPENROUTER_WEBHOOK_SECRET;

/**
 * Generate a valid X-OpenRouter-Signature header:
 * t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>," + raw body>
 */
function generateSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp},`, 'utf8'), Buffer.from(payload)]))
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function eventPayload(type, jobId = 'job_test_123') {
  const status = type.split('.')[2];
  return JSON.stringify({
    type,
    created_at: '2026-10-26T12:00:00.000Z',
    data: {
      id: jobId,
      status,
      generation_id: 'gen-123',
      model: 'google/veo-3.1-lite',
      unsigned_urls: status === 'completed' ? ['https://example.com/video.mp4'] : undefined,
      usage: { cost: 0.4, is_byok: false },
      error: status === 'failed' ? 'provider error' : undefined,
    },
  });
}

function post(payload, signature, contentType = 'application/json') {
  const req = request(app)
    .post('/webhooks/openrouter')
    .set('Content-Type', contentType)
    .set('X-OpenRouter-Idempotency-Key', 'job_test_123-completed');
  if (signature) req.set('X-OpenRouter-Signature', signature);
  return req.send(payload);
}

describe('OpenRouter Webhook Endpoint', () => {
  describe('POST /webhooks/openrouter', () => {
    it('returns 401 for a missing signature header', async () => {
      const response = await post(eventPayload('video.generation.completed'));
      expect(response.status).toBe(401);
    });

    it('returns 401 for an empty signature header', async () => {
      const response = await post(eventPayload('video.generation.completed'), ' ');
      expect(response.status).toBe(401);
    });

    it('returns 401 for a malformed header', async () => {
      const response = await post(eventPayload('video.generation.completed'), 'not-a-valid-header');
      expect(response.status).toBe(401);
    });

    it('returns 401 when t or v1 is missing', async () => {
      const payload = eventPayload('video.generation.completed');
      const valid = generateSignature(payload, webhookSecret);
      const [t, v1] = valid.split(',');
      expect((await post(payload, v1)).status).toBe(401);
      expect((await post(payload, t)).status).toBe(401);
    });

    it('returns 401 for an invalid (short) signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await post(eventPayload('video.generation.completed'), `t=${timestamp},v1=deadbeef`);
      expect(response.status).toBe(401);
    });

    it('returns 401 for a 64-character non-hex signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await post(eventPayload('video.generation.completed'), `t=${timestamp},v1=${'z'.repeat(64)}`);
      expect(response.status).toBe(401);
    });

    it('returns 401 for a signature made with the wrong secret', async () => {
      const payload = eventPayload('video.generation.completed');
      const response = await post(payload, generateSignature(payload, 'wrong_secret'));
      expect(response.status).toBe(401);
    });

    it('returns 401 for a tampered payload', async () => {
      const signature = generateSignature(eventPayload('video.generation.completed'), webhookSecret);
      const response = await post(eventPayload('video.generation.completed', 'job_tampered'), signature);
      expect(response.status).toBe(401);
    });

    it('returns 401 when the body was signed with a dot separator', async () => {
      const payload = eventPayload('video.generation.completed');
      const t = Math.floor(Date.now() / 1000);
      const v1 = crypto.createHmac('sha256', webhookSecret).update(`${t}.${payload}`).digest('hex');
      const response = await post(payload, `t=${t},v1=${v1}`);
      expect(response.status).toBe(401);
    });

    it('returns 204 for a valid signature', async () => {
      const payload = eventPayload('video.generation.completed');
      const response = await post(payload, generateSignature(payload, webhookSecret));
      expect(response.status).toBe(204);
    });

    it('accepts uppercase hex (compared case-insensitively)', async () => {
      const payload = eventPayload('video.generation.completed');
      const t = Math.floor(Date.now() / 1000);
      const sig = generateSignature(payload, webhookSecret, t).split('v1=')[1].toUpperCase();
      const response = await post(payload, `t=${t},v1=${sig}`);
      expect(response.status).toBe(204);
    });

    it('accepts a header with multiple v1 values if one matches', async () => {
      const payload = eventPayload('video.generation.completed');
      const valid = generateSignature(payload, webhookSecret);
      const response = await post(payload, `${valid},v1=${'0'.repeat(64)}`);
      expect(response.status).toBe(204);
    });

    it('verifies the exact bytes whatever the content type', async () => {
      const payload = eventPayload('video.generation.completed');
      const response = await post(payload, generateSignature(payload, webhookSecret), 'text/plain');
      expect(response.status).toBe(204);
    });

    it('verifies non-ASCII bodies byte for byte', async () => {
      const payload = JSON.stringify({ type: 'video.generation.failed', data: { id: 'j', status: 'failed', error: 'échec 失败 ✓' } });
      const response = await post(payload, generateSignature(payload, webhookSecret));
      expect(response.status).toBe(204);
    });

    it('does not reject old timestamps by default (retries/replays keep the original)', async () => {
      const payload = eventPayload('video.generation.completed');
      const oldTimestamp = Math.floor(Date.now() / 1000) - 86400;
      const response = await post(payload, generateSignature(payload, webhookSecret, oldTimestamp));
      expect(response.status).toBe(204);
    });

    it('rejects old timestamps when tolerance is enabled', async () => {
      const payload = eventPayload('video.generation.completed');
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
      process.env.OPENROUTER_WEBHOOK_TOLERANCE_SECONDS = '300';
      try {
        const stale = await post(payload, generateSignature(payload, webhookSecret, oldTimestamp));
        expect(stale.status).toBe(401);
        const fresh = await post(payload, generateSignature(payload, webhookSecret));
        expect(fresh.status).toBe(204);
      } finally {
        delete process.env.OPENROUTER_WEBHOOK_TOLERANCE_SECONDS;
      }
    });

    it('returns 400 for a validly signed non-JSON body', async () => {
      const payload = 'not json';
      const response = await post(payload, generateSignature(payload, webhookSecret));
      expect(response.status).toBe(400);
    });

    it('handles all documented and unknown event types', async () => {
      const eventTypes = [
        'video.generation.completed',
        'video.generation.failed',
        'video.generation.cancelled',
        'video.generation.expired',
        'video.generation.something_new',
      ];

      for (const eventType of eventTypes) {
        const payload = eventPayload(eventType);
        const response = await post(payload, generateSignature(payload, webhookSecret));
        expect(response.status).toBe(204);
      }
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
