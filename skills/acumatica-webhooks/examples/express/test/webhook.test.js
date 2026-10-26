const request = require('supertest');

// Set test environment variables before importing the app
process.env.ACUMATICA_WEBHOOK_HEADER = 'X-Acumatica-Key';
process.env.ACUMATICA_WEBHOOK_SECRET = 'Bearer test_acumatica_secret_0123456789';

const app = require('../src/index');
const { verifyAcumaticaRequest, classifyChange } = require('../src/index');

const HEADER = process.env.ACUMATICA_WEBHOOK_HEADER;
const SECRET = process.env.ACUMATICA_WEBHOOK_SECRET;

let counter = 0;

function samplePayload(overrides = {}) {
  counter += 1;
  return {
    Inserted: [{ InventoryID: 'AACOMPUT01', StockItem: true, ItemStatus: 'Inactive' }],
    Deleted: [{ InventoryID: 'AACOMPUT01', StockItem: true, ItemStatus: 'Active' }],
    Query: 'Stock Items: Last Modified Date',
    CompanyId: 'MyTenant',
    Id: `1af4d140-5321-41f2-a2ec-50b67f577c${String(counter).padStart(2, '0')}`,
    TimeStamp: 636295833829493672,
    AdditionalInfo: {},
    ...overrides,
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/acumatica')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Acumatica webhook endpoint', () => {
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

    it('compares the whole value, including the Bearer prefix', async () => {
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

    it('rejects the secret sent in a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await post('[]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('notification handling', () => {
    const cases = {
      inserted: { Deleted: [] },
      deleted: { Inserted: [] },
      updated: {},
      empty: { Inserted: [], Deleted: [] },
    };

    for (const [change, overrides] of Object.entries(cases)) {
      it(`handles a ${change} notification`, async () => {
        const body = JSON.stringify(samplePayload(overrides));
        const res = await post(body).set(HEADER, SECRET);
        expect(res.status).toBe(200);
        expect(classifyChange(JSON.parse(body))).toBe(change);
      });
    }

    it('acknowledges a duplicate Id with 200', async () => {
      const body = JSON.stringify(samplePayload());
      expect((await post(body).set(HEADER, SECRET)).status).toBe(200);
      expect((await post(body).set(HEADER, SECRET)).status).toBe(200);
    });
  });

  describe('verifyAcumaticaRequest()', () => {
    it('defaults the header name to Authorization', () => {
      const env = { ACUMATICA_WEBHOOK_SECRET: 'Bearer abc' };
      expect(verifyAcumaticaRequest({ authorization: 'Bearer abc' }, env)).toBe(true);
    });

    it('fails closed when the secret is unset', () => {
      expect(verifyAcumaticaRequest({ authorization: '' }, {})).toBe(false);
      expect(verifyAcumaticaRequest({}, {})).toBe(false);
    });

    it('rejects non-string header values', () => {
      const env = { ACUMATICA_WEBHOOK_SECRET: 'abc' };
      expect(verifyAcumaticaRequest({ authorization: ['abc'] }, env)).toBe(false);
    });
  });

  it('health check responds', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
