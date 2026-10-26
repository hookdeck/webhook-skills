const request = require('supertest');

// Set test environment variables before importing the app
process.env.RAILWAY_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.RAILWAY_WEBHOOK_SECRET = 'test_railway_secret_0123456789';

const app = require('../src/index');
const { verifyRailwayRequest } = require('../src/index');

const HEADER = process.env.RAILWAY_WEBHOOK_HEADER;
const SECRET = process.env.RAILWAY_WEBHOOK_SECRET;

function samplePayload(type = 'Deployment.failed') {
  return {
    type,
    details: { id: '8107edff-4b8e-44fc-b43a-04566e847a2a', source: 'GitHub', branch: 'main' },
    resource: {
      workspace: { id: 'w1', name: 'acme' },
      project: { id: 'p1', name: 'api' },
      environment: { id: 'e1', name: 'production', isEphemeral: false },
      service: { id: 's1', name: 'web' },
      deployment: { id: 'd1' }
    },
    severity: 'WARNING',
    timestamp: '2025-11-21T23:48:42.311Z'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/railway')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Railway webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('looks the header up case-insensitively', async () => {
      const res = await post().set(HEADER.toUpperCase(), SECRET);
      expect(res.status).toBe(200);
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

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('compares the whole value and does not strip a Bearer prefix', () => {
      const bearer = 'Bearer abc123';
      expect(verifyRailwayRequest({ authorization: bearer }, bearer, 'Authorization')).toBe(true);
      expect(verifyRailwayRequest({ authorization: 'abc123' }, bearer, 'Authorization')).toBe(false);
      expect(verifyRailwayRequest({ authorization: bearer }, 'abc123', 'Authorization')).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.RAILWAY_WEBHOOK_HEADER;
      expect(verifyRailwayRequest({ authorization: SECRET })).toBe(true);
      expect(verifyRailwayRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.RAILWAY_WEBHOOK_HEADER = HEADER;
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyRailwayRequest({ 'x-webhook-secret': SECRET }, '', HEADER)).toBe(false);
      expect(verifyRailwayRequest({ 'x-webhook-secret': '' }, '', HEADER)).toBe(false);
    });
  });

  describe('body handling', () => {
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    let spy;
    beforeEach(() => { spy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => spy.mockRestore());

    it('handles Deployment.failed', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Deployment failed'))).toBe(true);
    });

    it('handles other Deployment.<state> types by prefix', async () => {
      const res = await post(JSON.stringify(samplePayload('Deployment.success'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Deployment success'))).toBe(true);
    });

    it('acknowledges alert and unknown types', async () => {
      const res = await post(JSON.stringify(samplePayload('Alert.triggered'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
