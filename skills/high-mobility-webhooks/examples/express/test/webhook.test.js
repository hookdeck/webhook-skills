const request = require('supertest');
const crypto = require('crypto');

// High Mobility secrets are plain strings used as UTF-8 bytes; this one is only for tests
const SECRET = 'test_secret_for_high_mobility';
process.env.HIGH_MOBILITY_WEBHOOK_SECRET = SECRET;

const { app, verifyHighMobility } = require('../src/index');

const digest = (body, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');
const sign = (body, secret = SECRET) => `sha256=${digest(body, secret)}`;

// Payload as shown in High Mobility's docs
const clearance = {
  vehicle: { vin: '1HMCF6112HA3FBBCC' },
  event: {
    type: 'fleet_clearance_changed',
    action: 'rejected',
    detail: 'invalid VIN',
    received_at: '2025-06-19T09:49:08.386159Z',
  },
  application: { id: 'A77294AC8DA324FB46DA98921' },
};
const ping = {
  vehicle: { vin: '*' },
  event: { type: 'ping', received_at: '2025-06-19T09:49:08.386159Z' },
  application: { id: 'A77294AC8DA324FB46DA98921' },
};

function send(method, body, signature, contentType = 'application/json') {
  let r = request(app)[method]('/webhooks/high-mobility');
  if (signature !== undefined) r = r.set('X-HM-Signature-256', signature);
  if (body !== undefined) r = r.set('Content-Type', contentType).send(body);
  return r;
}

describe('High Mobility webhook', () => {
  beforeEach(() => {
    process.env.HIGH_MOBILITY_WEBHOOK_SECRET = SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('signature verification', () => {
    const body = JSON.stringify(clearance);

    it('accepts sha256=<hex>', async () => {
      const res = await send('post', body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the bare digest and uppercase hex', async () => {
      expect((await send('post', body, digest(body))).status).toBe(200);
      expect((await send('post', body, `sha256=${digest(body).toUpperCase()}`)).status).toBe(200);
    });

    it.each(['post', 'put', 'patch', 'delete'])('verifies %s requests', async (method) => {
      expect((await send(method, body, sign(body))).status).toBe(200);
      expect((await send(method, body, sign(body, 'wrong'))).status).toBe(401);
    });

    it('verifies a GET with no body over zero bytes and acknowledges it', async () => {
      const res = await send('get', undefined, sign(''));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect((await send('get', undefined, sign('x'))).status).toBe(401);
      expect((await send('get', undefined)).status).toBe(401);
    });

    it('verifies exact bytes for any content type', async () => {
      const text = JSON.stringify(clearance, null, 4); // formatting must not matter
      expect((await send('post', text, sign(text), 'text/plain')).status).toBe(200);
    });

    it('verifies raw bytes that are not valid UTF-8 (then rejects the JSON)', async () => {
      const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
      const res = await send('post', bytes, sign(bytes), 'application/octet-stream');
      expect(res.status).toBe(400);
    });

    it('rejects a missing, empty or malformed signature', async () => {
      expect((await send('post', body)).status).toBe(401);
      expect((await send('post', body, '')).status).toBe(401);
      expect((await send('post', body, 'sha256=')).status).toBe(401);
      expect((await send('post', body, 'sha256=abc123')).status).toBe(401);
      expect((await send('post', body, `sha256=${'z'.repeat(64)}`)).status).toBe(401);
      expect((await send('post', body, `sha256=${digest(body)}00`)).status).toBe(401);
      expect((await send('post', body, `sha1=${digest(body)}`)).status).toBe(401);
    });

    it('rejects a wrong secret and a tampered body', async () => {
      expect((await send('post', body, sign(body, 'wrong_secret'))).status).toBe(401);
      expect((await send('post', body + ' ', sign(body))).status).toBe(401);
    });

    it('ignores the deprecated X-HM-Signature header', async () => {
      const sha1 = crypto.createHmac('sha1', SECRET).update(body).digest('hex');
      const res = await request(app)
        .post('/webhooks/high-mobility')
        .set('Content-Type', 'application/json')
        .set('X-HM-Signature', sha1)
        .send(body);
      expect(res.status).toBe(401);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.HIGH_MOBILITY_WEBHOOK_SECRET;
      expect((await send('post', body, sign(body))).status).toBe(500);
    });
  });

  describe('event handling', () => {
    const post = (payload) => {
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return send('post', body, sign(body));
    };

    it('handles fleet_clearance_changed', async () => {
      const res = await post(clearance);
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(
        'Fleet clearance changed for 1HMCF6112HA3FBBCC: rejected invalid VIN'
      );
    });

    it('handles ping', async () => {
      expect((await post(ping)).status).toBe(200);
    });

    it('acknowledges unknown event types', async () => {
      const res = await post({ event: { type: 'something_else' } });
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled event: something_else');
    });

    it('returns 400 for signed invalid JSON or a non-object body', async () => {
      for (const bad of ['not json', '[]', '"text"', 'null', '42']) {
        expect((await post(bad)).status).toBe(400);
      }
    });

    it('ignores wrong-typed fields instead of failing', async () => {
      for (const payload of [
        { event: 'fleet_clearance_changed' },
        { event: ['x'], vehicle: 'vin' },
        { event: { type: 5, action: {}, detail: [] }, vehicle: { vin: 7 } },
        { event: { type: 'fleet_clearance_changed' }, vehicle: null },
        {},
      ]) {
        expect((await post(payload)).status).toBe(200);
      }
    });
  });

  describe('verifyHighMobility', () => {
    it('returns false without a secret or header', () => {
      expect(verifyHighMobility(Buffer.from('x'), sign('x'), '')).toBe(false);
      expect(verifyHighMobility(Buffer.from('x'), undefined, SECRET)).toBe(false);
    });
  });
});
