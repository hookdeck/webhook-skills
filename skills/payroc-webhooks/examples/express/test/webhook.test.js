const request = require('supertest');

// Set test environment variables before importing the app
process.env.PAYROC_WEBHOOK_SECRET = 'test_payroc_secret_0123456789';

const app = require('../src/index');
const { verifyPayrocRequest, seenIds } = require('../src/index');

const SECRET = process.env.PAYROC_WEBHOOK_SECRET;

// Payloads follow the samples in Payroc's event documentation.
const SAMPLES = {
  'processingAccount.status.changed': {
    specversion: '1.0',
    type: 'processingAccount.status.changed',
    version: '1.0.0',
    source: 'payroc',
    id: '123e4567-e89b-12d3-a456-426614174000',
    time: '2024-07-02T15:30:00.000Z',
    datacontenttype: 'application/json',
    data: { processingAccountId: '38765', status: 'entered' }
  },
  'processingAccount.riskStatus.changed': {
    specversion: '1.0',
    type: 'processingAccount.riskStatus.changed',
    version: '1.0.0',
    source: 'payroc',
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    time: '2024-09-15T10:45:00.000Z',
    datacontenttype: 'application/json',
    data: { processingAccountId: '38765', riskStatus: 'fullSuspense' }
  },
  'processingAccount.signature.signed': {
    specversion: '1.0',
    type: 'processingAccount.signature.signed',
    version: '1.0.0',
    source: 'payroc',
    id: '123e4567-e89b-12d3-a456-426614174001',
    time: '2026-05-21T11:30:00.000Z',
    datacontenttype: 'application/json',
    data: { processingAccountId: '38765', signed: 'true' }
  },
  // No documented sample payload: same CloudEvents envelope, illustrative data.
  'terminalOrder.status.changed': {
    specversion: '1.0',
    type: 'terminalOrder.status.changed',
    version: '1.0.0',
    source: 'payroc',
    id: '123e4567-e89b-12d3-a456-426614174002',
    time: '2024-07-02T15:30:00.000Z',
    datacontenttype: 'application/json',
    data: { terminalOrderId: '1234' }
  }
};

function post(body = JSON.stringify(SAMPLES['processingAccount.status.changed']), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/payroc')
    .set('Content-Type', contentType)
    .send(body);
}

beforeEach(() => seenIds.clear());

describe('Payroc webhook endpoint', () => {
  describe('Payroc-Secret verification', () => {
    it('accepts the correct secret with exactly 200', async () => {
      const res = await post().set('Payroc-Secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('payroc-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('Payroc-Secret', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a different length without throwing', async () => {
      const res = await post().set('Payroc-Secret', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a partial match (prefix of the secret)', async () => {
      const res = await post().set('Payroc-Secret', SECRET.slice(0, -1));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the secret as an Authorization bearer', async () => {
      const res = await post().set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('verifyPayrocRequest fails closed when no secret is configured', () => {
      expect(verifyPayrocRequest({ 'payroc-secret': SECRET }, '')).toBe(false);
    });

    it('verifyPayrocRequest reads PAYROC_WEBHOOK_SECRET by default', () => {
      expect(verifyPayrocRequest({ 'payroc-secret': SECRET })).toBe(true);
    });
  });

  describe('Events', () => {
    it.each(Object.keys(SAMPLES))('handles %s', async (type) => {
      const res = await post(JSON.stringify(SAMPLES[type])).set('Payroc-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown event types with 200', async () => {
      const body = JSON.stringify({ ...SAMPLES['processingAccount.status.changed'], type: 'something.else' });
      const res = await post(body).set('Payroc-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not reprocess a duplicate id but still returns 200', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await post().set('Payroc-Secret', SECRET);
      const calls = spy.mock.calls.length;
      const res = await post().set('Payroc-Secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
      expect(spy.mock.calls.length).toBe(calls);
      spy.mockRestore();
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(SAMPLES['processingAccount.status.changed']), 'text/plain')
        .set('Payroc-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authentication', async () => {
      const res = await post('not json').set('Payroc-Secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await post('[]').set('Payroc-Secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401 before parsing an invalid body without a secret', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });
});
