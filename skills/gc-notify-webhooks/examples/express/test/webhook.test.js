const request = require('supertest');

// Set test environment variables before importing the app
process.env.GC_NOTIFY_WEBHOOK_SECRET = 'test_gc_notify_bearer_token_0123456789';

const app = require('../src/index');
const { verifyGcNotifyRequest } = require('../src/index');

const SECRET = process.env.GC_NOTIFY_WEBHOOK_SECRET;
const AUTH = `Bearer ${SECRET}`;

const STATUSES = [
  'created', 'sending', 'pending', 'sent', 'delivered', 'permanent-failure',
  'temporary-failure', 'technical-failure', 'pending-virus-check', 'virus-scan-failed'
];

// Built from the field table in the GC Notify callbacks documentation (not a captured delivery).
function receipt(status = 'delivered') {
  return {
    id: '3b0f9c1e-6d6b-4a6c-9f1e-0a4d3d3f9e11',
    reference: '12345678',
    to: 'hello@canada.ca',
    status,
    status_description: 'Delivered',
    provider_response: null,
    created_at: '2017-05-14T12:15:30.000000Z',
    completed_at: '2017-05-14T12:15:30.000000Z',
    sent_at: '2017-05-14T12:15:30.000000Z',
    notification_type: 'email'
  };
}

function post(body = JSON.stringify(receipt()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/gc-notify')
    .set('Content-Type', contentType)
    .send(body);
}

describe('GC Notify callback endpoint', () => {
  describe('Bearer token verification', () => {
    it('accepts the correct token', async () => {
      const res = await post().set('Authorization', AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the scheme case-insensitively', async () => {
      for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
        const res = await post().set('Authorization', `${scheme} ${SECRET}`);
        expect(res.status).toBe(200);
      }
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set('Authorization', `Bearer ${'x'.repeat(SECRET.length)}`);
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'Bearer short');
      expect(res.status).toBe(401);
    });

    it('rejects the bare secret without a scheme', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects another scheme', async () => {
      const res = await post().set('Authorization', `Basic ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = { authorization: AUTH };
      expect(verifyGcNotifyRequest(headers, '')).toBe(false);
      expect(verifyGcNotifyRequest(headers, 'Bearer ')).toBe(false);
      delete process.env.GC_NOTIFY_WEBHOOK_SECRET;
      expect(verifyGcNotifyRequest(headers)).toBe(false);
      process.env.GC_NOTIFY_WEBHOOK_SECRET = SECRET;
    });

    it('accepts a configured secret that was pasted with the Bearer scheme', () => {
      const headers = { authorization: AUTH };
      expect(verifyGcNotifyRequest(headers, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyGcNotifyRequest(headers, `bearer ${SECRET}`)).toBe(true);
    });

    it('compares non-ASCII secrets byte for byte', () => {
      const secret = 'pässwörd-✓';
      // Node exposes header bytes as latin1 characters
      const wire = Buffer.from(secret, 'utf8').toString('latin1');
      expect(verifyGcNotifyRequest({ authorization: `Bearer ${wire}` }, secret)).toBe(true);
      expect(verifyGcNotifyRequest({ authorization: `Bearer ${secret}` }, secret)).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(receipt()), 'text/plain').set('Authorization', AUTH);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', AUTH);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', AUTH);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a token', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Receipt handling', () => {
    it.each(STATUSES)('handles %s', async (status) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(receipt(status))).set('Authorization', AUTH);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges the health check body', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ health_check: 'true' })).set('Authorization', AUTH);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown statuses', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(receipt('something-new'))).set('Authorization', AUTH);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
