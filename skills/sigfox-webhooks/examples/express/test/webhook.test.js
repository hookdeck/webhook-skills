const request = require('supertest');

// Set test environment variables before importing the app
process.env.SIGFOX_WEBHOOK_SECRET = 'Bearer sigfox_test_secret_0123456789';
delete process.env.SIGFOX_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifySigfoxRequest, classifyCallback } = require('../src/index');

const SECRET = process.env.SIGFOX_WEBHOOK_SECRET;

const UPLINK = {
  device: '1A2B3C', deviceTypeId: '5f3c8a1b', time: 1700000000, data: '0102030405', seqNumber: 42,
};

const CALLBACKS = {
  'data uplink': UPLINK,
  'data bidir': { ...UPLINK, longPolling: false, ack: true },
  'data advanced': { ...UPLINK, lqi: 'GOOD', linkQuality: 2 },
  'service status': { device: '1A2B3C', time: 1700000000, batt: 2.9, temp: 21.5 },
  'service acknowledge': { device: '1A2B3C', time: 1700000000, infoCode: 0, downlinkAck: true },
  'service repeater': { device: '1A2B3C', time: 1700000000, batt: 3.1, repeatedMsg: 12 },
  error: { device: '1A2B3C', time: 1700000000, info: 'last message 2h ago', severity: 'ERROR' },
};

function post(body = JSON.stringify(UPLINK), contentType = 'application/json') {
  return request(app).post('/webhooks/sigfox').set('Content-Type', contentType).send(body);
}

describe('Sigfox callback endpoint', () => {
  describe('credential header verification', () => {
    it('accepts the correct Authorization value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, type: 'data uplink' });
    });

    it('looks the header up case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, not a stripped Bearer token', async () => {
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

    it('does not throw on non-ASCII header values', async () => {
      const res = await post().set('Authorization', 'café-secret');
      expect(res.status).toBe(401);
    });

    it('uses SIGFOX_WEBHOOK_HEADER as the header name', async () => {
      process.env.SIGFOX_WEBHOOK_HEADER = 'X-Sigfox-Token';
      try {
        expect((await post().set('X-Sigfox-Token', SECRET)).status).toBe(200);
        expect((await post().set('x-sigfox-token', SECRET)).status).toBe(200);
        expect((await post().set('Authorization', SECRET)).status).toBe(401);
      } finally {
        delete process.env.SIGFOX_WEBHOOK_HEADER;
      }
    });

    it('rejects everything when SIGFOX_WEBHOOK_SECRET is unset', () => {
      expect(verifySigfoxRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.SIGFOX_WEBHOOK_SECRET;
      expect(verifySigfoxRequest({ authorization: SECRET })).toBe(false);
      process.env.SIGFOX_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('methods and bodies', () => {
    it('handles GET with variables in the query string and no body', async () => {
      const res = await request(app)
        .get('/webhooks/sigfox?device=1A2B3C&data=0102030405&time=1700000000')
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('data uplink');
    });

    it('rejects GET without the credential', async () => {
      const res = await request(app).get('/webhooks/sigfox?device=1A2B3C&data=01');
      expect(res.status).toBe(401);
    });

    it('handles PUT with a JSON body', async () => {
      const res = await request(app)
        .put('/webhooks/sigfox')
        .set('Content-Type', 'application/json')
        .set('Authorization', SECRET)
        .send(JSON.stringify(UPLINK));
      expect(res.status).toBe(200);
    });

    it('handles a form-encoded POST body', async () => {
      const res = await post('device=1A2B3C&data=0102030405&time=1700000000', 'application/x-www-form-urlencoded')
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('data uplink');
    });

    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(UPLINK), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('handles an empty POST body', async () => {
      const res = await request(app).post('/webhooks/sigfox').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('unknown');
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await post('[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });

    it('returns 405 for other methods', async () => {
      const res = await request(app).delete('/webhooks/sigfox').set('Authorization', SECRET);
      expect(res.status).toBe(405);
    });
  });

  describe('callback types', () => {
    Object.entries(CALLBACKS).forEach(([type, payload]) => {
      it(`handles ${type}`, async () => {
        expect(classifyCallback(payload)).toBe(type);
        const res = await post(JSON.stringify(payload)).set('Authorization', SECRET);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true, type });
      });
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
