const request = require('supertest');

// Set test environment variables before importing the app
process.env.JAMF_PRO_WEBHOOK_HEADER = 'X-Jamf-Secret';
process.env.JAMF_PRO_WEBHOOK_SECRET = 'Bearer test_jamf_secret_0123456789';

const app = require('../src/index');
const { verifyJamfProRequest, EVENT_LABELS } = require('../src/index');

const HEADER = process.env.JAMF_PRO_WEBHOOK_HEADER;
const SECRET = process.env.JAMF_PRO_WEBHOOK_SECRET;

const EVENTS = Object.keys(EVENT_LABELS);

function samplePayload(webhookEvent = 'ComputerAdded') {
  return {
    webhook: { id: 1, name: 'Test webhook', webhookEvent, eventTimestamp: 1761400000000 },
    event: { udid: 'A1B2C3D4-0000-1111-2222-333344445555', deviceName: 'Mac-1', serialNumber: 'C02XXXXXXXXX', jssID: 42 }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/jamf-pro')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Jamf Pro webhook endpoint', () => {
  describe('Header Authentication', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('looks the header name up case-insensitively', async () => {
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

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.JAMF_PRO_WEBHOOK_HEADER;
      expect(verifyJamfProRequest({ authorization: SECRET })).toBe(true);
      expect(verifyJamfProRequest({ [HEADER.toLowerCase()]: SECRET })).toBe(false);
      process.env.JAMF_PRO_WEBHOOK_HEADER = HEADER;
    });

    it('rejects everything when JAMF_PRO_WEBHOOK_SECRET is unset', () => {
      expect(verifyJamfProRequest({ [HEADER.toLowerCase()]: SECRET }, HEADER, '')).toBe(false);
      delete process.env.JAMF_PRO_WEBHOOK_SECRET;
      expect(verifyJamfProRequest({ [HEADER.toLowerCase()]: SECRET })).toBe(false);
      process.env.JAMF_PRO_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON (e.g. XML) after authenticating', async () => {
      const res = await post('<JSSEvent></JSSEvent>', 'application/xml').set(HEADER, SECRET);
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
    it('covers the 22 documented webhookEvent values', () => {
      expect(EVENTS).toHaveLength(22);
    });

    it.each(EVENTS)('handles %s', async (webhookEvent) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(webhookEvent))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('SomethingNew'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
