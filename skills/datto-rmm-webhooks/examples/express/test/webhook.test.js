const request = require('supertest');

// Set test environment variables before importing the app
process.env.DATTO_RMM_WEBHOOK_HEADER = 'X-Datto-Secret';
process.env.DATTO_RMM_WEBHOOK_SECRET = 'Bearer test_datto_rmm_secret_0123456789';

const app = require('../src/index');
const { verifyDattoRmmRequest } = require('../src/index');

const HEADER = process.env.DATTO_RMM_WEBHOOK_HEADER;
const SECRET = process.env.DATTO_RMM_WEBHOOK_SECRET;

// ILLUSTRATIVE payload: Datto RMM adds no event field; "status" comes from the user's template.
function samplePayload(status = 'raised') {
  return {
    status,
    alert_uid: 'a1b2c3d4',
    alert_type: 'disk usage',
    alert_category: 'performance',
    alert_message: 'C: drive is at 95% capacity',
    device_hostname: 'SRV-01',
    site_name: 'Acme',
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/datto-rmm')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Datto RMM webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toUpperCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, Bearer prefix included', async () => {
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

    it('rejects the secret sent under a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('defaults to the Authorization header when no name is configured', () => {
      delete process.env.DATTO_RMM_WEBHOOK_HEADER;
      expect(verifyDattoRmmRequest({ authorization: SECRET })).toBe(true);
      expect(verifyDattoRmmRequest({ 'x-datto-secret': SECRET })).toBe(false);
      process.env.DATTO_RMM_WEBHOOK_HEADER = HEADER;
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyDattoRmmRequest({ 'x-datto-secret': SECRET }, { secret: '' })).toBe(false);
      delete process.env.DATTO_RMM_WEBHOOK_SECRET;
      expect(verifyDattoRmmRequest({ 'x-datto-secret': SECRET })).toBe(false);
      process.env.DATTO_RMM_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('body handling', () => {
    it('accepts text/plain bodies', async () => {
      const res = await post('Alert raised on SRV-01', 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts form-urlencoded bodies', async () => {
      const res = await post('status=resolved&alert_uid=a1b2c3d4', 'application/x-www-form-urlencoded')
        .set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts JSON that is not valid (treated as text) after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 401 before looking at the body', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('alert handling (illustrative template)', () => {
    it.each(['raised', 'resolved'])('handles %s', async (status) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(status))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges payloads without a recognised status', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ hello: 'world' })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
