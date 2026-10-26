const request = require('supertest');

// Set test environment variables before importing the app
process.env.DIGITAL_SAMBA_WEBHOOK_SECRET = 'test_digital_samba_secret_0123456789';

const app = require('../src/index');
const { verifyDigitalSambaRequest } = require('../src/index');

const SECRET = process.env.DIGITAL_SAMBA_WEBHOOK_SECRET;

const EVENTS = [
  'participant_joined', 'participant_left', 'session_started', 'session_ended',
  'recording_started', 'recording_stopped', 'recording_ready', 'recording_deleted',
  'session_summary_ready', 'session_transcript_ready'
];

// Based on the documented participant_joined payload
function samplePayload(eventType = 'participant_joined') {
  return {
    eventType,
    sessionId: '4fcc375c-e0ce-4f52-9b35-3a034042ab5a',
    roomId: '7f8c8eac-6643-47db-8d93-e7633e6e53ec',
    timestamp: 1675790387,
    data: {
      participantId: '8b085f23-9a2a-465d-bdbb-73a233c7df90',
      name: 'John Smith',
      role: 'moderator'
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/digital-samba')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Digital Samba webhook endpoint', () => {
  describe('Authorization bearer verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the Bearer scheme case-insensitively', async () => {
      expect((await post().set('Authorization', `bearer ${SECRET}`)).status).toBe(200);
      expect((await post().set('Authorization', `BEARER ${SECRET}`)).status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('Authorization', `Bearer ${'x'.repeat(SECRET.length)}`);
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'Bearer short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      expect((await post()).status).toBe(401);
    });

    it('rejects the bare secret without the Bearer scheme', async () => {
      expect((await post().set('Authorization', SECRET)).status).toBe(401);
    });

    it('rejects a different scheme', async () => {
      expect((await post().set('Authorization', `Basic ${SECRET}`)).status).toBe(401);
    });

    it('does not trim the secret', () => {
      const headers = { authorization: `Bearer ${SECRET}` };
      expect(verifyDigitalSambaRequest(headers, ` ${SECRET}`)).toBe(false);
    });

    it('rejects everything when the secret is unset or empty', () => {
      const headers = { authorization: `Bearer ${SECRET}` };
      expect(verifyDigitalSambaRequest(headers, '')).toBe(false);
      expect(verifyDigitalSambaRequest(headers, 'Bearer ')).toBe(false);
      delete process.env.DIGITAL_SAMBA_WEBHOOK_SECRET;
      expect(verifyDigitalSambaRequest(headers)).toBe(false);
      process.env.DIGITAL_SAMBA_WEBHOOK_SECRET = SECRET;
    });

    it('strips a "Bearer " prefix from the configured secret', () => {
      const headers = { authorization: `Bearer ${SECRET}` };
      expect(verifyDigitalSambaRequest(headers, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyDigitalSambaRequest(headers, `bearer ${SECRET}`)).toBe(true);
    });

    it('handles non-ASCII secrets', () => {
      const secret = 'sécret-ключ';
      const header = Buffer.from(`Bearer ${secret}`, 'utf8').toString('latin1');
      expect(verifyDigitalSambaRequest({ authorization: header }, secret)).toBe(true);
      expect(verifyDigitalSambaRequest({ authorization: 'Bearer secret-xxx' }, secret)).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      expect((await post('{not json')).status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(eventType)))
        .set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something_new')))
        .set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
