const request = require('supertest');

// Set test environment variables before importing the app
process.env.HUNDRED_MS_WEBHOOK_SECRET = 'Bearer test_100ms_secret_0123456789';
delete process.env.HUNDRED_MS_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verify100msRequest, seenEventIds } = require('../src/index');

const SECRET = process.env.HUNDRED_MS_WEBHOOK_SECRET;

const EVENTS = [
  'session.open.success', 'session.close.success',
  'peer.join.success', 'peer.leave.success', 'peer.join.failure', 'peer.leave.failure',
  'room.end.success',
  'track.recording.started.success', 'track.recording.success', 'track.recording.failure',
  'stream.recording.success', 'stream.recording.failure',
  'recording.success', 'recording.failed',
  'beam.started.success', 'beam.stopped.success', 'beam.recording.success', 'beam.failure',
  'hls.started.success', 'hls.stopped.success', 'hls.recording.success', 'hls.failure',
  'role.change.success',
  'transcription.started.success', 'transcription.success', 'transcription.failure',
  'ingest.start.success', 'ingest.end.success', 'ingest.start.failure', 'ingest.failure',
  'sip.start.success', 'sip.start.failure', 'sip.end.success', 'sip.end.failure'
];

// Based on the sample peer.join.success payload in the 100ms docs.
function samplePayload(type = 'peer.join.success', id = '6c75de35-b778-4fb0-88ae-114c28dc285f') {
  return {
    version: '2.0',
    id,
    account_id: '60b8e13a6eb86d8101b57354',
    timestamp: '2021-08-08T07:04:15Z',
    type,
    data: {
      joined_at: '2021-08-08T07:04:15.001380432Z',
      peer_id: '83b869e1-9a4b-4037-84b2-913cf76e4392',
      role: 'host',
      room_id: '60b8e13a6eb86d8101b57354',
      room_name: 'test room',
      session_id: '610f81ee870dde099a249948',
      template_id: '66112497abcd52312556c4gg',
      user_id: 'user.001',
      user_name: 'test user'
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/100ms').set('Content-Type', contentType).send(body);
}

beforeEach(() => seenEventIds.clear());

describe('100ms webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact whole header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix (compares the whole value)', async () => {
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

    it('rejects everything when the secret is unset', () => {
      expect(verify100msRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.HUNDRED_MS_WEBHOOK_SECRET;
      expect(verify100msRequest({ authorization: SECRET })).toBe(false);
      process.env.HUNDRED_MS_WEBHOOK_SECRET = SECRET;
    });

    it('supports a custom header name', () => {
      expect(verify100msRequest({ 'x-hms-secret': 's3cret' }, 's3cret', 'X-HMS-Secret')).toBe(true);
      expect(verify100msRequest({ authorization: 's3cret' }, 's3cret', 'X-HMS-Secret')).toBe(false);
    });

    it('handles non-ASCII secrets', () => {
      const secret = 'sécret-ключ';
      const sent = Buffer.from(secret, 'utf8').toString('latin1'); // how Node decodes the header
      expect(verify100msRequest({ authorization: sent }, secret)).toBe(true);
      expect(verify100msRequest({ authorization: 'secret-key' }, secret)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON body without a type', async () => {
      const res = await post('{"id":"1"}').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(type))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something.new.success'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('dedupes retried deliveries on id', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const first = await post().set('Authorization', SECRET);
      const retry = await post().set('Authorization', SECRET);
      expect(first.body).toEqual({ received: true });
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({ received: true, duplicate: true });
      expect(spy.mock.calls.filter(([m]) => String(m).startsWith('Peer joined')).length).toBe(1);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
