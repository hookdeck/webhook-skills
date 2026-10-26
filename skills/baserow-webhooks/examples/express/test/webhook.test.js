const request = require('supertest');

// Set test environment variables before importing the app
process.env.BASEROW_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.BASEROW_WEBHOOK_SECRET = 'Bearer test_baserow_secret_0123456789';

const app = require('../src/index');
const { verifyBaserowRequest } = require('../src/index');

const HEADER = process.env.BASEROW_WEBHOOK_HEADER;
const SECRET = process.env.BASEROW_WEBHOOK_SECRET;

const EVENTS = [
  'rows.created', 'rows.updated', 'rows.deleted',
  'view.created', 'view.updated', 'view.deleted',
  'field.created', 'field.updated', 'field.deleted',
];

function samplePayload(eventType = 'rows.created') {
  return {
    table_id: 50000,
    database_id: 1000,
    workspace_id: 300,
    event_id: '00000000-0000-0000-0000-000000000000',
    event_type: eventType,
    items: [{ id: 1, order: '1.00000000000000000000', field_1: 'Hello' }],
  };
}

function send(method, body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/baserow');
  if (body !== null) req.set('Content-Type', contentType).send(body);
  return req;
}

describe('Baserow webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole header value', async () => {
      const res = await send('post').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('post').set(HEADER.toUpperCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
      const res = await send('post').set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post').set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post').set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send('post');
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await send('post').set('X-Other', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects an invalid request before parsing the body', async () => {
      const res = await send('post', 'not json');
      expect(res.status).toBe(401);
    });

    it('rejects every request when no secret is configured', () => {
      expect(verifyBaserowRequest({ [HEADER.toLowerCase()]: SECRET }, HEADER, '')).toBe(false);
      delete process.env.BASEROW_WEBHOOK_SECRET;
      try {
        expect(verifyBaserowRequest({ [HEADER.toLowerCase()]: SECRET }, HEADER)).toBe(false);
      } finally {
        process.env.BASEROW_WEBHOOK_SECRET = SECRET;
      }
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.BASEROW_WEBHOOK_HEADER;
      try {
        expect(verifyBaserowRequest({ authorization: SECRET })).toBe(true);
      } finally {
        process.env.BASEROW_WEBHOOK_HEADER = HEADER;
      }
    });
  });

  describe('HTTP methods', () => {
    for (const method of ['post', 'put', 'patch', 'get', 'delete']) {
      it(`accepts ${method.toUpperCase()} with a JSON body`, async () => {
        const res = await send(method).set(HEADER, SECRET);
        expect(res.status).toBe(200);
      });
    }

    it('requires the header on every method', async () => {
      for (const method of ['put', 'patch', 'get', 'delete']) {
        const res = await send(method);
        expect(res.status).toBe(401);
      }
    });
  });

  describe('body handling', () => {
    it('accepts an empty body', async () => {
      const res = await request(app).get('/webhooks/baserow').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a non-JSON content type', async () => {
      const res = await send('post', JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await send('post', 'not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('rejects a JSON array with 400', async () => {
      const res = await send('post', '[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const res = await send('post', JSON.stringify(samplePayload(eventType))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 200 for an unknown event type', async () => {
      const res = await send('post', JSON.stringify(samplePayload('something.else'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
