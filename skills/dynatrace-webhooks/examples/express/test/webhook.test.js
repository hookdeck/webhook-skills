const request = require('supertest');

// Set test environment variables before importing the app
process.env.DYNATRACE_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.DYNATRACE_WEBHOOK_SECRET = 'Bearer test_dynatrace_secret_0123456789';

const app = require('../src/index');
const { verifyDynatraceRequest } = require('../src/index');

const HEADER = process.env.DYNATRACE_WEBHOOK_HEADER;
const SECRET = process.env.DYNATRACE_WEBHOOK_SECRET;

// Illustrative payload: Dynatrace sends whatever template you configure.
function samplePayload(state = 'OPEN') {
  return {
    ProblemID: 'P-2401',
    State: state,
    ProblemTitle: 'Response time degradation',
    ImpactedEntity: 'checkout-service',
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/dynatrace')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Dynatrace webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact whole header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, not a stripped Bearer token', async () => {
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

    it('ignores the secret under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.DYNATRACE_WEBHOOK_HEADER;
      expect(verifyDynatraceRequest({ authorization: SECRET })).toBe(true);
      expect(verifyDynatraceRequest({ [HEADER.toLowerCase()]: SECRET })).toBe(false);
      process.env.DYNATRACE_WEBHOOK_HEADER = HEADER;
    });

    it('rejects everything when the secret is unset', () => {
      const headers = { [HEADER.toLowerCase()]: SECRET };
      expect(verifyDynatraceRequest(headers, HEADER, '')).toBe(false);
      delete process.env.DYNATRACE_WEBHOOK_SECRET;
      expect(verifyDynatraceRequest(headers)).toBe(false);
      process.env.DYNATRACE_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts XML bodies', async () => {
      const res = await post('<problem><id>1</id></problem>', 'application/xml').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts plain text bodies', async () => {
      const res = await post('Problem P-1 OPEN', 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 401 for an unauthenticated non-JSON body', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('problem handling', () => {
    it.each(['OPEN'])('handles %s', async (state) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(state))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    // The docs show only OPEN; other values (e.g. the one sent on resolution) are logged.
    it('acknowledges and logs other states', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('NOT_OPEN'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('state NOT_OPEN'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
