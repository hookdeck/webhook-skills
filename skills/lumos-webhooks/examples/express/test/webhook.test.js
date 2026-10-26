const request = require('supertest');

// Set test environment variables before importing the app
process.env.LUMOS_WEBHOOK_SECRET = 'Bearer test_lumos_secret_0123456789';
delete process.env.LUMOS_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyLumosRequest } = require('../src/index');

const SECRET = process.env.LUMOS_WEBHOOK_SECRET;

// Illustrative payloads: Lumos does not publish the field names.
function samplePayload() {
  return {
    user: { email: 'ada@example.com', given_name: 'Ada', family_name: 'Lovelace' },
    account: { id: 'acct_123', email: 'ada@example.com', username: 'ada' },
    application: { name: 'Zendesk', instance_id: 'inst_456' },
    permissions: ['Agent License'],
    comment: 'Offboarding',
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/lumos')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Lumos webhook endpoint', () => {
  describe('custom header verification', () => {
    it('accepts the correct Authorization value (whole value, with Bearer)', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix: the bare token is rejected', async () => {
      const res = await post().set('Authorization', SECRET.replace('Bearer ', ''));
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

    it('does not accept the Lumos signature header as the credential', async () => {
      const res = await post().set('X-Lumos-Webhook-Signature', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when LUMOS_WEBHOOK_SECRET is unset', () => {
      expect(verifyLumosRequest({ authorization: SECRET }, 'Authorization', '')).toBe(false);
      delete process.env.LUMOS_WEBHOOK_SECRET;
      expect(verifyLumosRequest({ authorization: SECRET })).toBe(false);
      process.env.LUMOS_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('LUMOS_WEBHOOK_HEADER', () => {
    afterEach(() => {
      delete process.env.LUMOS_WEBHOOK_HEADER;
    });

    it('reads the credential from the configured header', async () => {
      process.env.LUMOS_WEBHOOK_HEADER = 'X-Api-Key';
      const ok = await post().set('X-Api-Key', SECRET);
      expect(ok.status).toBe(200);
      const wrongHeader = await post().set('Authorization', SECRET);
      expect(wrongHeader.status).toBe(401);
    });

    it('compares non-ASCII values without throwing', async () => {
      process.env.LUMOS_WEBHOOK_HEADER = 'X-Api-Key';
      expect(verifyLumosRequest({ 'x-api-key': 'café' }, 'X-Api-Key', 'café')).toBe(true);
      expect(verifyLumosRequest({ 'x-api-key': 'café' }, 'X-Api-Key', 'cafe')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', SECRET);
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

    it('returns 401, not 400, for invalid JSON without credentials', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });

    it('handles a payload with no recognised fields', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post('{}').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
