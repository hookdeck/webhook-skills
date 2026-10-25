const request = require('supertest');

// Set test environment variables before importing the app
process.env.FACTORIAL_WH_CHALLENGE = '2zal4e6d-test-challenge';

const app = require('../src/index');
const { verifyFactorialRequest } = require('../src/index');

const CHALLENGE = process.env.FACTORIAL_WH_CHALLENGE;
const HEADER = 'x-factorial-wh-challenge';

const TYPES = [
  'employees/employee/create_with_contract', 'employees/employee/update',
  'employees/employee/terminate', 'contracts/contract_version/create',
  'timeoff/leave/create', 'timeoff/leave/approve', 'timeoff/leave/reject',
  'attendance/shift/clock_in', 'ats/application/create', 'ats/candidate/create',
];

// Factorial sends the resource itself: no wrapper, no event field.
function sampleResource() {
  return {
    id: 2,
    full_name: 'Ana Blanco Perez',
    email: 'ana@factorial.com',
    active: true,
    terminated_on: null,
    created_at: '2010-10-06T00:00:00.000Z',
    updated_at: '2026-10-01T10:32:11.000Z',
  };
}

function post(body = JSON.stringify(sampleResource()), contentType = 'application/json', type) {
  return request(app)
    .post('/webhooks/factorial' + (type ? `?type=${encodeURIComponent(type)}` : ''))
    .set('Content-Type', contentType)
    .send(body);
}

describe('Factorial webhook endpoint', () => {
  describe('x-factorial-wh-challenge verification', () => {
    it('accepts the correct challenge', async () => {
      const res = await post().set(HEADER, CHALLENGE);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-Factorial-WH-Challenge', CHALLENGE);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong challenge of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(CHALLENGE.length));
      expect(res.status).toBe(401);
    });

    it('rejects a challenge of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a challenge that only starts with the right value', async () => {
      const res = await post().set(HEADER, `${CHALLENGE}-extra`);
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the challenge as an Authorization bearer', async () => {
      const res = await post().set('Authorization', `Bearer ${CHALLENGE}`);
      expect(res.status).toBe(401);
    });

    it('rejects everything when FACTORIAL_WH_CHALLENGE is unset', () => {
      expect(verifyFactorialRequest({ [HEADER]: CHALLENGE }, '')).toBe(false);
      delete process.env.FACTORIAL_WH_CHALLENGE;
      expect(verifyFactorialRequest({ [HEADER]: CHALLENGE })).toBe(false);
      process.env.FACTORIAL_WH_CHALLENGE = CHALLENGE;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(sampleResource()), 'text/plain').set(HEADER, CHALLENGE);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, CHALLENGE);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(HEADER, CHALLENGE);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the challenge', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Subscription type handling', () => {
    it.each(TYPES)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(sampleResource()), 'application/json', type).set(HEADER, CHALLENGE);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges a delivery with no type hint', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post().set(HEADER, CHALLENGE);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges an unknown subscription type', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(sampleResource()), 'application/json', 'new/thing/happen').set(HEADER, CHALLENGE);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
