const request = require('supertest');
const crypto = require('crypto');

process.env.CASTLE_API_SECRET = 'test_castle_api_secret';

const { app, verifyCastleSignature } = require('../src/index');

// Castle: base64(HMAC-SHA256(raw body, API secret))
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

describe('Castle webhook', () => {
  const secret = process.env.CASTLE_API_SECRET;

  describe('verifyCastleSignature', () => {
    it('accepts a valid signature', () => {
      const body = Buffer.from('{"type":"$policy.matched"}');
      expect(verifyCastleSignature(body, sign(body, secret), secret)).toBe(true);
    });

    it('rejects an invalid signature', () => {
      const body = Buffer.from('{"type":"$policy.matched"}');
      expect(verifyCastleSignature(body, 'nope', secret)).toBe(false);
    });

    it('rejects a missing signature', () => {
      expect(verifyCastleSignature(Buffer.from('{}'), undefined, secret)).toBe(false);
    });

    it('rejects a signature made with another secret', () => {
      const body = Buffer.from('{}');
      expect(verifyCastleSignature(body, sign(body, 'other'), secret)).toBe(false);
    });
  });

  describe('POST /webhooks/castle', () => {
    const post = (payload, signature) => {
      const r = request(app)
        .post('/webhooks/castle')
        .set('Content-Type', 'application/json');
      if (signature) r.set('X-Castle-Signature', signature);
      return r.send(payload);
    };

    it('returns 400 for missing signature', async () => {
      const res = await post('{"type":"$policy.matched"}');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid signature', async () => {
      const res = await post('{"type":"$policy.matched"}', 'invalid');
      expect(res.status).toBe(400);
    });

    it('returns 400 when body is modified after signing', async () => {
      const signature = sign('{"type":"$policy.matched"}', secret);
      const res = await post('{"type":"$list_item.created"}', signature);
      expect(res.status).toBe(400);
    });

    it('returns 200 for a valid $policy.matched event', async () => {
      const payload = JSON.stringify({
        api_version: 'v1',
        app_id: '526745498142982',
        created_at: '2024-12-06T21:35:56.260Z',
        type: '$policy.matched',
        data: { policy: { id: 'p1', name: 'Trust @legit.io', action: 'allow' }, event: { id: 'e1' } },
      });
      const res = await post(payload, sign(payload, secret));
      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
    });

    it('handles all documented event types', async () => {
      const types = ['$policy.matched', '$list_item.created', '$list_item.archived', '$list_item.unarchived'];
      for (const type of types) {
        const payload = JSON.stringify({ api_version: 'v1', type, data: { id: 'x', primary_value: 'abc' } });
        const res = await post(payload, sign(payload, secret));
        expect(res.status).toBe(200);
      }
    });

    it('returns 200 for unknown event types with a valid signature', async () => {
      const payload = JSON.stringify({ type: '$unknown.event', data: {} });
      const res = await post(payload, sign(payload, secret));
      expect(res.status).toBe(200);
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
