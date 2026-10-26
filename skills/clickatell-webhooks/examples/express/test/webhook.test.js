const request = require('supertest');

// Set test environment variables before importing the app
process.env.CLICKATELL_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.CLICKATELL_WEBHOOK_SECRET = 'Bearer test_clickatell_secret_0123456789';

const app = require('../src/index');
const { verifyClickatellRequest } = require('../src/index');

const HEADER = process.env.CLICKATELL_WEBHOOK_HEADER;
const SECRET = process.env.CLICKATELL_WEBHOOK_SECRET;

const EVENTS = [
  'messageStatusUpdate', 'messageFallback', 'statusIsTyping', 'moText', 'moMedia',
  'moLocation', 'moContacts', 'moSuggestedResponse', 'moListPickerResponse', 'moButtonResponse'
];

function samplePayload(kind = 'messageStatusUpdate') {
  return {
    integrationId: 'fa8090815f05d5ed015f0b5b56080cd2',
    integrationName: 'My integration',
    event: {
      [kind]: [{
        channel: 'whatsapp',
        timestamp: 1506607698860,
        statusCode: 5,
        status: 'DEVICE_ACK',
        messageId: '3a89680503414383af44dcd0e4e5f184',
        from: '2799900001',
        content: 'hello'
      }]
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/clickatell')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Clickatell webhook endpoint', () => {
  describe('Custom Security Header verification', () => {
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

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.CLICKATELL_WEBHOOK_HEADER;
      expect(verifyClickatellRequest({ authorization: 'Bearer abc' }, { expected: 'Bearer abc' })).toBe(true);
      process.env.CLICKATELL_WEBHOOK_HEADER = HEADER;
    });

    it('rejects everything when CLICKATELL_WEBHOOK_SECRET is unset', () => {
      expect(verifyClickatellRequest({ 'x-webhook-secret': SECRET }, { expected: '' })).toBe(false);
      delete process.env.CLICKATELL_WEBHOOK_SECRET;
      expect(verifyClickatellRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.CLICKATELL_WEBHOOK_SECRET = SECRET;
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

    it('returns 400 when there is no event object', async () => {
      const res = await post('{"integrationId":"abc"}').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (kind) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(kind))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown event kinds', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('somethingNew'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled event: somethingNew'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
