const request = require('supertest');

// Set test environment variables before importing the app
process.env.SEVALLA_WEBHOOK_SECRET = 'whsec_abcdefghijklmnopqrstuvwxyz0123';
delete process.env.SEVALLA_WEBHOOK_SECRET_OLD;

const app = require('../src/index');
const { verifySevallaRequest } = require('../src/index');

const SECRET = process.env.SEVALLA_WEBHOOK_SECRET;

const EVENTS = [
  'APP_CREATE', 'APP_DEPLOY', 'APP_UPDATE', 'APP_DELETE',
  'STATIC_SITE_CREATE', 'STATIC_SITE_DEPLOY', 'STATIC_SITE_UPDATE', 'STATIC_SITE_DELETE',
  'DATABASE_CREATE', 'DATABASE_UPDATE', 'DATABASE_DELETE'
];

let counter = 0;

// Based on the APP_DEPLOY payload shown in Sevalla's docs
function samplePayload(type = 'APP_DEPLOY') {
  counter += 1;
  return {
    webhook_id: 'd5f8a1c2-3b4e-4f6a-8b8c-9d0e1f2a3b4c',
    event_id: `evt-${counter}`,
    event_delivery_id: 'f1e2d3c4-b5a6-4788-9a0b-c1d2e3f4a5b6',
    type,
    data: {
      company_id: '0c9e3f5a-7b2d-4e1f-8a6c-5d4b3a2f1e0d',
      app_id: '7f3c2b1a-9e8d-4c7b-a6f5-4e3d2c1b0a9f',
      app_name: 'storefront-x7k2m',
      app_display_name: 'storefront',
      deployment_id: '3b2a1c0d-8e7f-4a6b-9c5d-2e1f0a9b8c7d',
      status: 'success',
      commit: '9fceb02d0ae598e95dc970b74767f19372d61af8',
      stage: '',
      is_preview: false
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/sevalla')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Sevalla webhook endpoint', () => {
  describe('svl-signature verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set('svl-signature', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('SVL-Signature', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('svl-signature', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('svl-signature', 'short');
      expect(res.status).toBe(401);
    });

    it('requires the whole value, including the whsec_ prefix', async () => {
      const res = await post().set('svl-signature', SECRET.slice('whsec_'.length));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects an empty header', async () => {
      const res = await post().set('svl-signature', '');
      expect(res.status).toBe(401);
    });

    it('does not treat the header as an HMAC of the body', async () => {
      const crypto = require('crypto');
      const body = JSON.stringify(samplePayload());
      const hmac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      expect((await post(body).set('svl-signature', hmac)).status).toBe(401);
    });

    it('rejects everything when SEVALLA_WEBHOOK_SECRET is unset', () => {
      expect(verifySevallaRequest({ 'svl-signature': SECRET }, [])).toBe(false);
      expect(verifySevallaRequest({ 'svl-signature': '' }, [''])).toBe(false);
      expect(verifySevallaRequest({ 'svl-signature': SECRET }, [undefined])).toBe(false);
      expect(verifySevallaRequest({ 'svl-signature': SECRET }, [SECRET])).toBe(true);
    });

    it('accepts the old secret during a rollover', () => {
      const OLD = 'whsec_oldoldoldoldoldoldoldoldold01';
      expect(verifySevallaRequest({ 'svl-signature': OLD }, [SECRET, OLD])).toBe(true);
      expect(verifySevallaRequest({ 'svl-signature': OLD }, [SECRET])).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('svl-signature', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('svl-signature', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('svl-signature', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(type))).set('svl-signature', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('SOMETHING_NEW'))).set('svl-signature', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('drops a retry with the same event_id', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload('APP_DEPLOY'));
      const first = await post(body).set('svl-signature', SECRET);
      const second = await post(body).set('svl-signature', SECRET);
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
