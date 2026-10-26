const request = require('supertest');

// Set test environment variables before importing the app
process.env.MAXIMIZER_WEBHOOK_HEADER = 'X-Maximizer-Auth';
process.env.MAXIMIZER_WEBHOOK_SECRET = 'Bearer test_maximizer_secret_0123456789';

const app = require('../src/index');
const { verifyMaximizerRequest } = require('../src/index');

const HEADER = process.env.MAXIMIZER_WEBHOOK_HEADER;
const SECRET = process.env.MAXIMIZER_WEBHOOK_SECRET;

const EVENTS = [
  ['AbEntry', 'Create'], ['AbEntry', 'Update'], ['AbEntry', 'Delete'],
  ['Opportunity', 'Create'], ['Opportunity', 'Update'], ['Opportunity', 'Delete'],
  ['Lead', 'Create'], ['Lead', 'Update'], ['Lead', 'Delete']
];

// Shape from https://developer.maximizer.com/docs/webhooks (an array; Op lives in Data).
function sampleWebhook(entity = 'Opportunity', op = 'Update') {
  return {
    Id: 'd81f9d6e-8afc-4fa4-9052-2af207494e5d',
    Timestamp: '2024-09-20T00:01:29.5149836Z',
    ProcessedTimestamp: '2024-09-20T00:02:45.8974002Z',
    WorkspaceId: '108F314C-6787-4EE6-BE49-C0E0C651F039',
    SourceId: '1a0dde7c-743f-4b55-a2bf-e7738393a8e5',
    Recipients: [],
    Options: null,
    Entity: entity,
    Data: {
      Op: op,
      Original: op === 'Create' ? null : { Key: 'T3Bwb3J0dW5pdHkJMjQwOTE5' },
      New: op === 'Delete' ? null : { Key: 'T3Bwb3J0dW5pdHkJMjQwOTE5', Objective: 'Test Opportunity' },
      Version: '1.1'
    }
  };
}

function post(body = JSON.stringify([sampleWebhook()]), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/maximizer')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Maximizer webhook endpoint', () => {
  describe('Credential header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
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

    it('defaults the header name to Authorization', () => {
      expect(verifyMaximizerRequest({ authorization: 'Bearer abc' }, 'Bearer abc', undefined)).toBe(false);
      expect(verifyMaximizerRequest({ authorization: 'Bearer abc' }, 'Bearer abc', 'Authorization')).toBe(true);
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyMaximizerRequest({ 'x-maximizer-auth': SECRET }, '', HEADER)).toBe(false);
      expect(verifyMaximizerRequest({ 'x-maximizer-auth': SECRET }, SECRET, HEADER)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify([sampleWebhook()]), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON object (Maximizer sends an array)', async () => {
      const res = await post(JSON.stringify(sampleWebhook())).set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an array of non-objects', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });

    it('accepts an empty array', async () => {
      const res = await post('[]').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s.%s', async (entity, op) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify([sampleWebhook(entity, op)])).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('handles every webhook in a batch', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const batch = [sampleWebhook('AbEntry', 'Create'), sampleWebhook('Lead', 'Delete')];
      const res = await post(JSON.stringify(batch)).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.map(([m]) => String(m))).toEqual([
        expect.stringContaining('Contact created'),
        expect.stringContaining('Lead deleted')
      ]);
      spy.mockRestore();
    });

    it('accepts a lower-case Op', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify([sampleWebhook('Lead', 'create')])).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown entities', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify([sampleWebhook('UnknownEntity', 'Create')])).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('still returns 200 when a handler throws after acknowledging', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      const broken = { Entity: 'AbEntry', Data: { Op: 'Create' } }; // no New: handler may throw
      const res = await post(JSON.stringify([{ Entity: 'AbEntry', Data: null, Op: 'Create' }, broken])).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      log.mockRestore();
      err.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
