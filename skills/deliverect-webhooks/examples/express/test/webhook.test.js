const crypto = require('crypto');
const request = require('supertest');

// Before certification Deliverect signs with the call's channelLink or locationId; after,
// with the HMAC secret from Integration settings. Any string works as the key (UTF-8 bytes).
const SECRET = 'test_hmac_secret_from_integration_settings';
process.env.DELIVERECT_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

const HEADER = 'x-server-authorization-hmac-sha256';

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(path, body, signature = sign(body)) {
  const req = request(app).post(path).set('Content-Type', 'application/json');
  if (signature !== null) req.set(HEADER, signature); // null = send no header
  return req.send(body);
}

describe('Deliverect webhook', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('signature verification', () => {
    const body = JSON.stringify({ orderId: 'o-1', status: 20 });

    it('accepts a valid signature', async () => {
      const res = await post('/webhooks/deliverect/order_status_update', body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts an uppercase hex digest', async () => {
      const res = await post('/webhooks/deliverect', body, sign(body).toUpperCase());
      expect(res.status).toBe(200);
    });

    it('rejects a missing header', async () => {
      expect((await post('/webhooks/deliverect', body, null)).status).toBe(401);
    });

    it('rejects an empty header', async () => {
      expect((await post('/webhooks/deliverect', body, '')).status).toBe(401);
    });

    it('rejects a wrong signature', async () => {
      expect((await post('/webhooks/deliverect', body, 'a'.repeat(64))).status).toBe(401);
    });

    it('rejects a signature made with another secret', async () => {
      expect((await post('/webhooks/deliverect', body, sign(body, 'other'))).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await post('/webhooks/deliverect', body.replace('20', '30'), sign(body));
      expect(res.status).toBe(401);
    });

    it('rejects a prefixed digest', async () => {
      expect((await post('/webhooks/deliverect', body, `sha256=${sign(body)}`)).status).toBe(401);
    });

    it('rejects a digest with the wrong length', async () => {
      expect((await post('/webhooks/deliverect', body, sign(body).slice(0, 62))).status).toBe(401);
      expect((await post('/webhooks/deliverect', body, `${sign(body)}00`)).status).toBe(401);
    });

    it('rejects a digest with non-hex characters', async () => {
      expect((await post('/webhooks/deliverect', body, `${sign(body).slice(0, 62)}zz`)).status).toBe(401);
    });

    it('rejects a digest followed by junk', async () => {
      expect((await post('/webhooks/deliverect', body, `${sign(body)} extra`)).status).toBe(401);
    });

    it('verifies the exact bytes, not a re-serialized body', async () => {
      const spaced = '{ "orderId": "o-1",  "status": 20 }';
      expect((await post('/webhooks/deliverect', spaced, sign(spaced))).status).toBe(200);
      // signature of the compact form does not match the spaced bytes actually sent
      expect((await post('/webhooks/deliverect', spaced, sign(body))).status).toBe(401);
    });

    it('rejects everything when no secret is configured', async () => {
      delete process.env.DELIVERECT_WEBHOOK_SECRET;
      try {
        const res = await post('/webhooks/deliverect', body, sign(body, ''));
        expect(res.status).toBe(401);
      } finally {
        process.env.DELIVERECT_WEBHOOK_SECRET = SECRET;
      }
    });
  });

  describe('methods', () => {
    it('accepts a signed GET with no body (HMAC over the empty string)', async () => {
      const res = await request(app).get('/webhooks/deliverect').set(HEADER, sign(''));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects a GET with no signature', async () => {
      expect((await request(app).get('/webhooks/deliverect')).status).toBe(401);
    });

    it('rejects a GET signed over something other than the empty string', async () => {
      const res = await request(app).get('/webhooks/deliverect').set(HEADER, sign('{}'));
      expect(res.status).toBe(401);
    });

    it.each(['put', 'patch', 'delete'])('accepts a signed %s', async (method) => {
      const body = JSON.stringify({ status: 'PAUSED' });
      const res = await request(app)
        [method]('/webhooks/deliverect/busy_mode')
        .set('Content-Type', 'application/json')
        .set(HEADER, sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('verifies any content type over the raw bytes', async () => {
      const body = '{"orderId":"o-2"}';
      const res = await request(app)
        .post('/webhooks/deliverect')
        .set('Content-Type', 'text/plain')
        .set(HEADER, sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });
  });

  describe('webhook kinds', () => {
    it('handles order status updates', async () => {
      const body = JSON.stringify({ orderId: 'o-9', status: 50 });
      expect((await post('/webhooks/deliverect/order_status_update', body)).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Order o-9 status: 50');
    });

    it('handles menu updates', async () => {
      const body = JSON.stringify({ menus: [{}, {}] });
      expect((await post('/webhooks/deliverect/menu_update', body)).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Menu update with 2 menu(s)');
    });

    it('handles snooze/unsnooze operations', async () => {
      const body = JSON.stringify({ operations: [{ action: 'snooze', data: { items: [{ plu: 'a' }] } }] });
      expect((await post('/webhooks/deliverect/snooze_unsnooze', body)).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Snooze operation "snooze" for 1 item(s)');
    });

    it('handles busy mode and accepts hyphens in the kind', async () => {
      const body = JSON.stringify({ status: 'PAUSED' });
      expect((await post('/webhooks/deliverect/busy-mode', body)).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Busy mode: PAUSED');
    });

    it('acknowledges an unrecognised kind', async () => {
      const body = JSON.stringify({ hello: 'world' });
      expect((await post('/webhooks/deliverect/something_else', body)).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Deliverect call: something_else');
    });
  });

  describe('untrusted body', () => {
    it('returns 400 for invalid JSON after a valid signature', async () => {
      expect((await post('/webhooks/deliverect', '{not json')).status).toBe(400);
    });

    it.each(['[1,2]', '"text"', '42', 'null'])('returns 400 for non-object JSON %s', async (body) => {
      expect((await post('/webhooks/deliverect', body)).status).toBe(400);
    });

    it('does not fail on wrong-typed fields', async () => {
      const cases = [
        ['order_status_update', { orderId: 5, status: { a: 1 } }],
        ['menu_update', { menus: 'nope' }],
        ['snooze_unsnooze', { operations: 'x' }],
        ['snooze_unsnooze', { operations: [null, 7, { action: 3, data: 'y' }, { action: 'snooze', data: { items: 5 } }] }],
        ['busy_mode', { status: ['PAUSED'] }],
      ];
      for (const [kind, payload] of cases) {
        const res = await post(`/webhooks/deliverect/${kind}`, JSON.stringify(payload));
        expect(res.status).toBe(200);
      }
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
