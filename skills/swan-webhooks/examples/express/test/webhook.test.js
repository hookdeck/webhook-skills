const request = require('supertest');

// Set test environment variables before importing the app
process.env.SWAN_WEBHOOK_SECRET = 'test_swan_secret_0123456789';

const app = require('../src/index');
const { verifySwanRequest } = require('../src/index');

const SECRET = process.env.SWAN_WEBHOOK_SECRET;

const EVENTS = [
  'Transaction.Booked', 'Transaction.Pending', 'Transaction.Rejected', 'Account.Created',
  'AccountHolder.Updated', 'Card.Created', 'Onboarding.Updated'
];

let counter = 0;
function samplePayload(eventType = 'Transaction.Booked') {
  counter += 1;
  return {
    eventType,
    eventId: `evt_${counter}`,
    eventDate: '2021-08-18T09:35:46.673Z',
    projectId: 'project-id',
    resourceId: 'resource-id'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/swan')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Swan webhook endpoint', () => {
  describe('x-swan-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set('x-swan-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-Swan-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('x-swan-secret', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('x-swan-secret', 'short');
      expect(res.status).toBe(401);
    });

    it('compares the whole value (a prefix or extra suffix is rejected)', async () => {
      expect((await post().set('x-swan-secret', SECRET.slice(0, -1))).status).toBe(401);
      expect((await post().set('x-swan-secret', `${SECRET}x`)).status).toBe(401);
      expect((await post().set('x-swan-secret', `Bearer ${SECRET}`)).status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects an empty header', async () => {
      const res = await post().set('x-swan-secret', '');
      expect(res.status).toBe(401);
    });

    it('handles a non-ASCII secret value without throwing', async () => {
      const res = await post().set('x-swan-secret', Buffer.from('sécret', 'utf8').toString('latin1'));
      expect(res.status).toBe(401);
    });

    it('rejects everything when SWAN_WEBHOOK_SECRET is unset', () => {
      expect(verifySwanRequest({ 'x-swan-secret': SECRET }, '')).toBe(false);
      delete process.env.SWAN_WEBHOOK_SECRET;
      expect(verifySwanRequest({ 'x-swan-secret': SECRET })).toBe(false);
      process.env.SWAN_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('x-swan-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('x-swan-secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('x-swan-secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(eventType))).set('x-swan-secret', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('Something.New'))).set('x-swan-secret', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('dedupes on eventId', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload());
      const first = await post(body).set('x-swan-secret', SECRET);
      const second = await post(body).set('x-swan-secret', SECRET);
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
      expect(spy.mock.calls.filter(([m]) => String(m).startsWith('Transaction booked'))).toHaveLength(1);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
