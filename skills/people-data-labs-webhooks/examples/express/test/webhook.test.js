const request = require('supertest');

// Set test environment variables before importing the app
process.env.PEOPLE_DATA_LABS_WEBHOOK_HEADER = 'Authorization';
process.env.PEOPLE_DATA_LABS_WEBHOOK_SECRET = 'Bearer pk_test_0123456789';

const app = require('../src/index');
const { verifyPdlRequest } = require('../src/index');

const SECRET = process.env.PEOPLE_DATA_LABS_WEBHOOK_SECRET;
const IDS = ['9adnit66-hdZ5lkBbq-AOQ_0000', 'YraxDoP16jzyjfxtn-1XJQ_0000', '6Wu6sKeyNfaLF3CVBgoysg_0000'];

function post(body = JSON.stringify(IDS), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/people-data-labs')
    .set('Content-Type', contentType)
    .send(body);
}

describe('People Data Labs webhook endpoint', () => {
  describe('shared header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the configured header name case-insensitively', async () => {
      const res = await post().set('aUtHoRiZaTiOn', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value', async () => {
      const res = await post().set('Authorization', 'Bearer pk_wrong_0123456789');
      expect(res.status).toBe(401);
    });

    it('compares the whole value: the bare token without Bearer is rejected', async () => {
      const res = await post().set('Authorization', 'pk_test_0123456789');
      expect(res.status).toBe(401);
    });

    it('does not strip a Bearer prefix from the expected value', async () => {
      const res = await post().set('Authorization', 'Bearer  pk_test_0123456789');
      expect(res.status).toBe(401);
    });

    it('rejects a value of different length without throwing', async () => {
      const res = await post().set('Authorization', 'x');
      expect(res.status).toBe(401);
    });

    it('rejects when the secret is not configured', () => {
      expect(verifyPdlRequest({ authorization: 'anything' }, { secret: '' })).toBe(false);
      expect(verifyPdlRequest({ authorization: 'anything' }, { secret: undefined })).toBe(false);
    });

    it('supports a custom header name', () => {
      const opts = { name: 'x-pdl-key', secret: 'abc123' };
      expect(verifyPdlRequest({ 'x-pdl-key': 'abc123' }, opts)).toBe(true);
      expect(verifyPdlRequest({ authorization: 'abc123' }, opts)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('authenticates before parsing (bad body + no header is 401, not 400)', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(IDS), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an empty batch', async () => {
      const res = await post('[]').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an object body', async () => {
      const res = await post(JSON.stringify({ ids: IDS })).set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an array of non-strings', async () => {
      const res = await post(JSON.stringify([1, 2])).set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
