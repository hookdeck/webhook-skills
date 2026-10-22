const request = require('supertest');

// Set test environment variables before importing the app
process.env.HASURA_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.HASURA_WEBHOOK_SECRET = 'Bearer test_hasura_secret_0123456789';

const app = require('../src/index');
const { verifyHasuraRequest } = require('../src/index');

const HEADER = process.env.HASURA_WEBHOOK_HEADER;
const SECRET = process.env.HASURA_WEBHOOK_SECRET;

const OPS = ['INSERT', 'UPDATE', 'DELETE', 'MANUAL'];

function samplePayload(op = 'INSERT') {
  return {
    created_at: '2020-07-29T10:00:00.000Z',
    delivery_info: { current_retry: 0, max_retries: 0 },
    event: {
      data: { new: op === 'DELETE' ? null : { id: 1, name: 'John' }, old: op === 'INSERT' || op === 'MANUAL' ? null : { id: 1, name: 'Jane' } },
      op,
      session_variables: { 'x-hasura-role': 'admin' },
      trace_context: { span_id: '123', trace_id: '456' },
    },
    id: '123e4567-e89b-12d3-a456-426614174000',
    table: { name: 'users', schema: 'public' },
    trigger: { name: 'insert_user' },
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/hasura').set('Content-Type', contentType).send(body);
}

describe('Hasura webhook endpoint', () => {
  describe('Secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await post().set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('ignores the secret sent under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.HASURA_WEBHOOK_HEADER;
      delete process.env.HASURA_WEBHOOK_HEADER;
      expect(verifyHasuraRequest({ authorization: 'abc' }, { secret: 'abc' })).toBe(true);
      process.env.HASURA_WEBHOOK_HEADER = saved;
    });

    it('rejects everything when HASURA_WEBHOOK_SECRET is unset', () => {
      expect(verifyHasuraRequest({ 'x-webhook-secret': SECRET }, { secret: '' })).toBe(false);
      delete process.env.HASURA_WEBHOOK_SECRET;
      expect(verifyHasuraRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.HASURA_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 when event.op is missing', async () => {
      const res = await post(JSON.stringify({ event: {} })).set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(OPS)('handles %s', async (op) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(op))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown ops', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('SOMETHING_NEW'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
