const request = require('supertest');

// Set test environment variables before importing the app
process.env.AIMFOX_WEBHOOK_HEADER = 'Authorization';
process.env.AIMFOX_WEBHOOK_SECRET = 'Bearer test_aimfox_secret_0123456789';

const app = require('../src/index');
const { verifyAimfoxRequest } = require('../src/index');

const SECRET = process.env.AIMFOX_WEBHOOK_SECRET;

const EVENTS = [
  'account_logged_in', 'account_logged_out', 'new_connection', 'view', 'connect', 'accepted',
  'inmail', 'message', 'new_reply', 'reply', 'inmail_reply', 'lead_label_added',
  'campaign_created', 'campaign_started', 'campaign_ended', 'inbox_event', 'campaign_reply'
];

function samplePayload(type = 'new_connection') {
  return {
    id: 'b82dce4c-34ef-4d08-875b-bf53a7432661',
    event_type: type,
    event: { timestamp: '2024-11-24T21:08:27.966Z' },
    workspace: { id: '47973863-0513-4ee6-910a-c5bc55782ed2', name: 'Aimfox Workspace' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/aimfox')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Aimfox webhook endpoint', () => {
  describe('Authentication Header verification', () => {
    it('accepts the correct whole value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
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

    it('rejects when the credential is in a different header', async () => {
      const res = await post().set('X-Aimfox-Secret', SECRET);
      expect(res.status).toBe(401);
    });

    it('reads a custom header name from AIMFOX_WEBHOOK_HEADER', () => {
      process.env.AIMFOX_WEBHOOK_HEADER = 'X-Aimfox-Secret';
      try {
        expect(verifyAimfoxRequest({ 'x-aimfox-secret': SECRET })).toBe(true);
        expect(verifyAimfoxRequest({ authorization: SECRET })).toBe(false);
      } finally {
        process.env.AIMFOX_WEBHOOK_HEADER = 'Authorization';
      }
    });

    it('defaults to Authorization when AIMFOX_WEBHOOK_HEADER is unset', () => {
      delete process.env.AIMFOX_WEBHOOK_HEADER;
      try {
        expect(verifyAimfoxRequest({ authorization: SECRET })).toBe(true);
      } finally {
        process.env.AIMFOX_WEBHOOK_HEADER = 'Authorization';
      }
    });

    it('accepts a whole Basic value', () => {
      const basic = 'Basic dXNlcjpwYXNz';
      expect(verifyAimfoxRequest({ authorization: basic }, basic)).toBe(true);
      expect(verifyAimfoxRequest({ authorization: 'dXNlcjpwYXNz' }, basic)).toBe(false);
    });

    it('handles non-ASCII header values without throwing', () => {
      expect(verifyAimfoxRequest({ authorization: 'Bearer pässword' }, SECRET)).toBe(false);
    });

    it('rejects everything when AIMFOX_WEBHOOK_SECRET is unset', () => {
      expect(verifyAimfoxRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.AIMFOX_WEBHOOK_SECRET;
      expect(verifyAimfoxRequest({ authorization: SECRET })).toBe(false);
      process.env.AIMFOX_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(type))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something_new'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
