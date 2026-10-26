const request = require('supertest');

// Set test environment variables before importing the app
process.env.POSTSCRIPT_WEBHOOK_TOKEN = 'test_postscript_token_0123456789abcdef';

const app = require('../src/index');
const { verifyPostscriptRequest } = require('../src/index');

const TOKEN = process.env.POSTSCRIPT_WEBHOOK_TOKEN;

const EVENTS = [
  'shop.incoming_message',
  'shop.subscriber.opt_in',
  'shop.subscriber.opt_out',
  'shop.email_collected'
];

function samplePayload(event = 'shop.incoming_message') {
  return {
    webhook_id: '89066f0a-eb36-4ed8-b98c-606e6dcac715',
    resource_type: 'shop',
    resource_id: 'shop_1234567abcd',
    event_time: '2021-11-04T21:52:41.025455',
    event,
    event_data: {
      id: 'im_1b2a005a386281c9',
      subscriber_id: 's_1234567abcd',
      shop_id: 'shop_1234567abcd',
      from_number: '+15555555555',
      body: 'Hello, world'
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/postscript')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Postscript webhook endpoint', () => {
  describe('Postscript-Signature verification', () => {
    it('accepts the correct token', async () => {
      const res = await post().set('Postscript-Signature', TOKEN);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('postscript-signature', TOKEN);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set('Postscript-Signature', 'x'.repeat(TOKEN.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set('Postscript-Signature', 'short');
      expect(res.status).toBe(401);
    });

    it('compares the whole value (no prefix or truncation)', async () => {
      expect((await post().set('Postscript-Signature', `v1=${TOKEN}`)).status).toBe(401);
      expect((await post().set('Postscript-Signature', TOKEN.slice(0, -1))).status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects everything when POSTSCRIPT_WEBHOOK_TOKEN is unset', () => {
      expect(verifyPostscriptRequest({ 'postscript-signature': TOKEN }, '')).toBe(false);
      delete process.env.POSTSCRIPT_WEBHOOK_TOKEN;
      expect(verifyPostscriptRequest({ 'postscript-signature': TOKEN })).toBe(false);
      process.env.POSTSCRIPT_WEBHOOK_TOKEN = TOKEN;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Postscript-Signature', TOKEN);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Postscript-Signature', TOKEN);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Postscript-Signature', TOKEN);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a token', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(event))).set('Postscript-Signature', TOKEN);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('shop.something_new'))).set('Postscript-Signature', TOKEN);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
