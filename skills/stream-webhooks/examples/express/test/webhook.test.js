const request = require('supertest');
const crypto = require('crypto');
const zlib = require('zlib');

// Stream API secrets are opaque strings used as-is (UTF-8) as the HMAC key
process.env.STREAM_API_SECRET = 'test_stream_api_secret_0123456789abcdefghijklmnopqrstuvwxyz';
process.env.STREAM_API_KEY = 'a1b23cdefgh4';

const { app, verifyStreamWebhook } = require('../src/index');

/** Generate a valid Stream signature: hex HMAC-SHA256 of the body */
function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('Stream webhooks', () => {
  const secret = process.env.STREAM_API_SECRET;
  const payload = JSON.stringify({
    type: 'message.new',
    cid: 'messaging:general',
    message: { id: 'm1', text: 'hello' },
  });

  describe('verifyStreamWebhook', () => {
    it('accepts a valid signature', () => {
      expect(verifyStreamWebhook(Buffer.from(payload), sign(payload, secret), secret)).toBe(true);
    });

    it('rejects an invalid signature', () => {
      expect(verifyStreamWebhook(Buffer.from(payload), 'deadbeef', secret)).toBe(false);
    });

    it('rejects a missing signature', () => {
      expect(verifyStreamWebhook(Buffer.from(payload), undefined, secret)).toBe(false);
    });

    it('rejects a signature made with another secret', () => {
      expect(verifyStreamWebhook(Buffer.from(payload), sign(payload, 'other'), secret)).toBe(false);
    });

    it('rejects a tampered body', () => {
      const sig = sign(payload, secret);
      expect(verifyStreamWebhook(Buffer.from(payload + ' '), sig, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/stream', () => {
    // Stream always sends X-Api-Key; the handler checks it when STREAM_API_KEY is set
    const baseHeaders = { 'X-Api-Key': process.env.STREAM_API_KEY };
    const post = (body, headers = {}) =>
      request(app).post('/webhooks/stream').set({ ...baseHeaders, ...headers }).send(body);

    it('accepts a valid JSON webhook', async () => {
      const res = await post(payload, {
        'Content-Type': 'application/json',
        'X-Signature': sign(payload, secret),
        'X-Webhook-Id': '123e4567-e89b-12d3-a456-426614174000',
        'X-Api-Key': 'a1b23cdefgh4',
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('verifies regardless of content type', async () => {
      const res = await post(payload, {
        'Content-Type': 'text/plain',
        'X-Signature': sign(payload, secret),
      });
      expect(res.status).toBe(200);
    });

    it.each([
      'message.new',
      'message.updated',
      'message.deleted',
      'reaction.new',
      'channel.created',
      'user.updated',
      'member.added',
      'some.future_event',
    ])('handles %s', async (type) => {
      const body = JSON.stringify({ type, cid: 'messaging:general' });
      const res = await post(body, {
        'Content-Type': 'application/json',
        'X-Signature': sign(body, secret),
      });
      expect(res.status).toBe(200);
    });

    it('rejects an invalid signature', async () => {
      const res = await post(payload, {
        'Content-Type': 'application/json',
        'X-Signature': 'bad',
      });
      expect(res.status).toBe(400);
    });

    it('rejects a missing signature', async () => {
      const res = await post(payload, { 'Content-Type': 'application/json' });
      expect(res.status).toBe(400);
    });

    it('rejects a mismatched X-Api-Key', async () => {
      const res = await post(payload, {
        'Content-Type': 'application/json',
        'X-Signature': sign(payload, secret),
        'X-Api-Key': 'someone_else',
      });
      expect(res.status).toBe(400);
    });

    it('verifies a gzip body against the uncompressed bytes', async () => {
      const gz = zlib.gzipSync(Buffer.from(payload));
      const res = await request(app)
        .post('/webhooks/stream')
        .set(baseHeaders)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip')
        .set('X-Signature', sign(payload, secret))
        .serialize((b) => b) // superagent would JSON-encode a Buffer otherwise
        .send(gz);
      expect(res.status).toBe(200);
    });

    it('rejects a gzip body signed over the compressed bytes', async () => {
      const gz = zlib.gzipSync(Buffer.from(payload));
      const res = await request(app)
        .post('/webhooks/stream')
        .set(baseHeaders)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip')
        .set('X-Signature', sign(gz, secret))
        .serialize((b) => b) // superagent would JSON-encode a Buffer otherwise
        .send(gz);
      expect(res.status).toBe(400);
    });

    it('rejects invalid JSON with a valid signature', async () => {
      const body = 'not json';
      const res = await post(body, {
        'Content-Type': 'text/plain',
        'X-Signature': sign(body, secret),
      });
      expect(res.status).toBe(400);
    });
  });
});
