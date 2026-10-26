const request = require('supertest');

const USERNAME = 'rebilly_test_user';
const PASSWORD = 'p@ss:word/with:colons+and=signs';

process.env.REBILLY_WEBHOOK_USERNAME = USERNAME;
process.env.REBILLY_WEBHOOK_PASSWORD = PASSWORD;

const app = require('../src/index');
const { verifyRebillyRequest } = app;

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const EVENTS = {
  'transaction-processed': { transactionId: 'txn_123' },
  'transaction-declined': { transactionId: 'txn_124' },
  'customer-created': { customerId: 'cus_123' },
  'subscription-activated': { subscriptionId: 'sub_123' },
  'subscription-canceled': { subscriptionId: 'sub_124' },
  'invoice-issued': { invoiceId: 'inv_123' },
  'invoice-paid': { invoiceId: 'inv_124' },
};

// Payload as shown in Rebilly's documentation (data-export-completed).
const DATA_EXPORT_COMPLETED = {
  dataExportId: 'd9dd134f-0bee-46b1-bec0-992da3173336',
  fileId: 'd348968b-41ed-4d7d-b534-02e5265c8912',
  eventType: 'data-export-completed',
  _embedded: {
    dataExport: {
      id: 'd9dd134f-0bee-46b1-bec0-992da3173336',
      name: 'Preview',
      resource: 'customers',
      format: 'csv',
      status: 'pending',
      _links: [
        {
          rel: 'self',
          href: 'https://api-sandbox.rebilly.com/organizations/a9f68e6e-e2e6-43dd-a27f-8120121d7428/experimental/data-exports/d9dd134f-0bee-46b1-bec0-992da3173336',
        },
      ],
    },
  },
  _links: [
    {
      rel: 'download',
      href: 'https://api-sandbox.rebilly.com/organizations/a9f68e6e-e2e6-43dd-a27f-8120121d7428/files/d348968b-41ed-4d7d-b534-02e5265c8912/download',
    },
  ],
};

function basic(username = USERNAME, password = PASSWORD) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function payloadFor(eventType) {
  if (eventType === 'data-export-completed') return DATA_EXPORT_COMPLETED;
  return { eventType, ...EVENTS[eventType], _embedded: {}, _links: [] };
}

describe('Rebilly webhook endpoint', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .set('Authorization', basic())
        .send(JSON.stringify(payloadFor('transaction-processed')));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a lowercase scheme and a password containing colons', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .set('Authorization', basic().replace('Basic', 'basic'))
        .send(JSON.stringify(payloadFor('customer-created')));
      expect(res.status).toBe(200);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(payloadFor('transaction-processed')));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Authorization', basic(USERNAME, 'wrong'))
        .send('{}');
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Authorization', basic('someone-else', PASSWORD))
        .send('{}');
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Authorization', `Bearer ${PASSWORD}`)
        .send('{}');
      expect(res.status).toBe(401);
    });

    it('rejects base64 with trailing junk', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Authorization', `${basic()}!!!`)
        .send('{}');
      expect(res.status).toBe(401);
    });

    it('rejects credentials without a colon', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Authorization', 'Basic ' + Buffer.from('nocolon').toString('base64'))
        .send('{}');
      expect(res.status).toBe(401);
    });

    it('does not read the body before authenticating', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .send('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('methods', () => {
    it.each(METHODS)('accepts %s with valid credentials and an empty body', async (method) => {
      const res = await request(app)[method]('/webhooks/rebilly').set('Authorization', basic());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it.each(METHODS)('rejects %s without credentials', async (method) => {
      const res = await request(app)[method]('/webhooks/rebilly');
      expect(res.status).toBe(401);
    });

    it.each(['put', 'patch'])('handles an event sent with %s', async (method) => {
      const res = await request(app)
        [method]('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .set('Authorization', basic())
        .send(JSON.stringify(payloadFor('invoice-paid')));
      expect(res.status).toBe(200);
    });
  });

  describe('events', () => {
    const names = [...Object.keys(EVENTS), 'data-export-completed'];

    it.each(names)('handles %s and returns exactly 200', async (eventType) => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .set('Authorization', basic())
        .send(JSON.stringify(payloadFor(eventType)));
      expect(res.status).toBe(200);
    });

    it('logs the event it handled', async () => {
      await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .set('Authorization', basic())
        .send(JSON.stringify(DATA_EXPORT_COMPLETED));
      expect(console.log).toHaveBeenCalledWith(
        'Data export completed: d9dd134f-0bee-46b1-bec0-992da3173336'
      );
    });

    it('returns 200 for unknown events', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .set('Authorization', basic())
        .send(JSON.stringify({ eventType: 'brand-new-event' }));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'text/plain')
        .set('Authorization', basic())
        .send(JSON.stringify(payloadFor('customer-created')));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .set('Authorization', basic())
        .send('{not json');
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await request(app)
        .post('/webhooks/rebilly')
        .set('Content-Type', 'application/json')
        .set('Authorization', basic())
        .send('[1,2,3]');
      expect(res.status).toBe(400);
    });
  });

  describe('verifyRebillyRequest', () => {
    it('fails closed when credentials are not configured', () => {
      expect(verifyRebillyRequest({ authorization: basic() }, '', '')).toBe(false);
    });

    it('fails closed when the environment variables are unset', () => {
      delete process.env.REBILLY_WEBHOOK_USERNAME;
      delete process.env.REBILLY_WEBHOOK_PASSWORD;
      try {
        expect(verifyRebillyRequest({ authorization: basic() })).toBe(false);
      } finally {
        process.env.REBILLY_WEBHOOK_USERNAME = USERNAME;
        process.env.REBILLY_WEBHOOK_PASSWORD = PASSWORD;
      }
    });

    it('verifies against explicit credentials', () => {
      expect(verifyRebillyRequest({ authorization: basic('a', 'b') }, 'a', 'b')).toBe(true);
      expect(verifyRebillyRequest({ authorization: basic('a', 'b') }, 'a', 'c')).toBe(false);
    });

    it('handles non-ASCII credentials', () => {
      expect(verifyRebillyRequest({ authorization: basic('usér', 'pässwörd') }, 'usér', 'pässwörd')).toBe(true);
    });
  });
});
