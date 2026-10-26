const request = require('supertest');

// Set test environment variables before importing the app
process.env.PLUNK_WEBHOOK_HEADER = 'Authorization';
process.env.PLUNK_WEBHOOK_SECRET = 'Bearer test_plunk_secret_0123456789';

const app = require('../src/index');
const { verifyPlunkRequest, classifyEvent } = require('../src/index');

const SECRET = process.env.PLUNK_WEBHOOK_SECRET;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Default body shape from the Plunk docs: { contact, workflow, execution, event }
function defaultBody(event = { bounceType: 'Permanent', bouncedAt: '2025-01-15T10:30:00.000Z' }) {
  return {
    contact: { email: 'user@example.com', subscribed: true, data: { name: 'John' } },
    workflow: { id: 'wf_abc123', name: 'Bounce Notifications' },
    execution: { id: 'exec_xyz789', startedAt: '2025-01-15T10:30:00.000Z' },
    event: {
      subject: 'Welcome to Plunk',
      emailId: 'ac32f08e-c6b9-45d3-9824-a73dff1e3bbf',
      ...event,
    },
  };
}

function post(body = JSON.stringify(defaultBody()), contentType = 'application/json') {
  return request(app).post('/webhooks/plunk').set('Content-Type', contentType).send(body);
}

describe('Plunk webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact whole header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip the Bearer prefix', async () => {
      const res = await post().set('Authorization', 'test_plunk_secret_0123456789');
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the secret in another header', async () => {
      const res = await post().set('X-Plunk-Secret', SECRET);
      expect(res.status).toBe(401);
    });
  });

  describe('configurable header name', () => {
    it('reads the header name from PLUNK_WEBHOOK_HEADER', () => {
      expect(verifyPlunkRequest({ 'x-plunk-secret': 's3cret' }, 's3cret', 'X-Plunk-Secret')).toBe(true);
      expect(verifyPlunkRequest({ authorization: 's3cret' }, 's3cret', 'X-Plunk-Secret')).toBe(false);
    });

    it('defaults to Authorization', () => {
      expect(verifyPlunkRequest({ authorization: 's3cret' }, 's3cret')).toBe(true);
    });

    it('fails closed when no secret is configured', () => {
      expect(verifyPlunkRequest({ authorization: 'anything' }, '')).toBe(false);
      expect(verifyPlunkRequest({ authorization: 'anything' }, undefined)).toBe(false);
    });

    it('handles non-ASCII values without throwing', () => {
      expect(verifyPlunkRequest({ authorization: 'sécret' }, 'secret')).toBe(false);
      expect(verifyPlunkRequest({ authorization: 'sécret' }, 'sécret')).toBe(true);
    });
  });

  describe('methods', () => {
    it.each(METHODS)('accepts %s with a valid secret and an empty body', async (method) => {
      const res = await request(app)[method]('/webhooks/plunk').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it.each(METHODS)('rejects %s without the secret', async (method) => {
      const res = await request(app)[method]('/webhooks/plunk');
      expect(res.status).toBe(401);
    });

    it.each(['put', 'patch', 'delete'])('accepts %s with a JSON body', async (method) => {
      const res = await request(app)
        [method]('/webhooks/plunk')
        .set('Authorization', SECRET)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(defaultBody()));
      expect(res.status).toBe(200);
    });
  });

  describe('bodies', () => {
    it.each([
      ['bounce', { bounceType: 'Permanent', bouncedAt: '2025-01-15T10:30:00.000Z' }],
      ['complaint', { complainedAt: '2025-01-15T10:30:00.000Z' }],
      ['click', { link: 'https://example.com', clickedAt: '2025-01-15T11:05:00.000Z' }],
      ['open', { openedAt: '2025-01-15T11:00:00.000Z', opens: 1 }],
      ['delivery', { deliveredAt: '2025-01-15T10:30:05.000Z' }],
      ['sent', { sentAt: '2025-01-15T10:30:00.000Z' }],
      ['segment', { segmentId: 'seg_abc123', segmentName: 'VIP Users' }],
      ['contact event with no data', {}],
    ])('handles the default body for %s', async (_name, event) => {
      const res = await post(JSON.stringify(defaultBody(event))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('handles a custom body as plain JSON', async () => {
      const res = await post(JSON.stringify({ email: 'user@example.com', plan: 'pro', referrer: 'x' }))
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(defaultBody()), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('checks the credential before parsing the body', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('classifyEvent', () => {
    it('infers the kind from documented event fields', () => {
      expect(classifyEvent({ bounceType: 'Permanent' })).toBe('email.bounce');
      expect(classifyEvent({ complainedAt: 'x' })).toBe('email.complaint');
      expect(classifyEvent({ segmentId: 'seg_1' })).toBe('segment');
      expect(classifyEvent({})).toBeNull();
      expect(classifyEvent(undefined)).toBeNull();
    });
  });

  it('serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
