const request = require('supertest');

// Set test environment variables before importing the app
process.env.DEMODESK_WEBHOOK_HEADER = 'X-Demodesk-Secret';
process.env.DEMODESK_WEBHOOK_SECRET = 'Bearer test_demodesk_secret_0123456789';

const app = require('../src/index');
const { verifyDemodeskRequest } = require('../src/index');

const HEADER = process.env.DEMODESK_WEBHOOK_HEADER;
const SECRET = process.env.DEMODESK_WEBHOOK_SECRET;

const EVENTS = [
  'demo.scheduled', 'demo.rescheduled', 'demo.event_response_updated', 'demo.handovered',
  'demo.canceled', 'demo.started', 'demo.call_note_updated', 'demo.ended',
  'recording.uploaded', 'recording.transcription_postprocessed'
];

function samplePayload(action = 'demo.scheduled') {
  return { meta: { event: { action } }, data: { demo: { id: 'demo_123' } } };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/demodesk')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Demodesk webhook endpoint', () => {
  describe('custom header verification', () => {
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

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when DEMODESK_WEBHOOK_SECRET is unset', () => {
      expect(verifyDemodeskRequest({ [HEADER.toLowerCase()]: SECRET }, HEADER, '')).toBe(false);
      delete process.env.DEMODESK_WEBHOOK_SECRET;
      expect(verifyDemodeskRequest({ [HEADER.toLowerCase()]: SECRET })).toBe(false);
      process.env.DEMODESK_WEBHOOK_SECRET = SECRET;
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.DEMODESK_WEBHOOK_HEADER;
      expect(verifyDemodeskRequest({ authorization: SECRET })).toBe(true);
      expect(verifyDemodeskRequest({ [HEADER.toLowerCase()]: SECRET })).toBe(false);
      process.env.DEMODESK_WEBHOOK_HEADER = HEADER;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (action) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(action))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('demo.something_new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
