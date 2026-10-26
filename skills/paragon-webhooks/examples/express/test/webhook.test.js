const request = require('supertest');

// Set test environment variables before importing the app
process.env.PARAGON_WEBHOOK_SECRET = 'Bearer test_paragon_secret_0123456789';
process.env.PARAGON_WEBHOOK_HEADER = 'Authorization';

const app = require('../src/index');
const { verifyParagonRequest } = require('../src/index');

const SECRET = process.env.PARAGON_WEBHOOK_SECRET;

const EVENTS = ['workflow_failure', 'credentials_failure'];

function samplePayload(type = 'workflow_failure') {
  if (type === 'credentials_failure') {
    return {
      type,
      timestamp: 1729629449422,
      timestampISO: '2024-10-22T20:37:43.849Z',
      message: 'Connected User “user_1“ credential for slack expired and can not be refreshed.',
      user: { id: 'user_1', metadata: {} },
      project: { id: '613b038f-e9bf-49ec-bc58-ba8d620754c7', name: 'Test Project Name' },
      integration: { id: '57a96b31-c69e-421a-bb32-7a25f9c6a893', type: 'slack' },
      data: { userId: 'user_1', error: 'invalid_grant' }
    };
  }
  return {
    type,
    timestamp: 1729629642607,
    timestampISO: '2024-10-22T20:40:42.607Z',
    message: 'Workflow “Test Workflow Name“ failed for User user_1',
    user: { id: 'user_1', metadata: {} },
    project: { id: '613b038f-e9bf-49ec-bc58-ba8d620754c7', name: 'Test Project Name' },
    integration: { id: '57a96b31-c69e-421a-bb32-7a25f9c6a893', type: 'slack' },
    workflow: { id: 'cae72d65-7fc6-4249-9047-48fc640bfd46', name: 'Test Workflow Name' },
    data: { type, error: 'Test error message' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/paragon')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Paragon webhook endpoint', () => {
  describe('Shared credential verification', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: does not strip a Bearer prefix', async () => {
      const res = await post().set('Authorization', SECRET.replace(/^Bearer /, ''));
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

    it('rejects everything when no secret is configured', () => {
      const headers = { authorization: SECRET };
      expect(verifyParagonRequest(headers, '')).toBe(false);
      expect(verifyParagonRequest(headers, SECRET)).toBe(true);
    });

    it('reads a custom header name', () => {
      const headers = { 'x-paragon-secret': 'abc123' };
      expect(verifyParagonRequest(headers, 'abc123', 'X-Paragon-Secret')).toBe(true);
      expect(verifyParagonRequest(headers, 'abc123', 'Authorization')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(type))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something_new'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
