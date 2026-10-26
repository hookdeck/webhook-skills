const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'sk_test_freemius_product_secret_key';
process.env.FREEMIUS_WEBHOOK_SECRET = SECRET;

const { app, verifyFreemiusSignature } = require('../src/index');

// Same algorithm as Freemius: bare hex HMAC-SHA256 of the raw body, key = secret as UTF-8
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/freemius').set('Content-Type', contentType);
  if (signature !== undefined) req.set('x-signature', signature);
  return req.send(body);
}

describe('Freemius webhook', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe.each([
    'license.activated',
    'license.created',
    'license.cancelled',
    'subscription.created',
    'subscription.cancelled',
    'payment.created',
    'payment.refund',
    'user.created',
  ])('event %s', (type) => {
    it('accepts a validly signed event', async () => {
      const body = JSON.stringify({ id: 42, type, objects: { license: { id: 7 } } });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });
  });

  it('acknowledges event types it does not handle', async () => {
    const body = JSON.stringify({ id: 1, type: 'affiliate.approved' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled Freemius event type: affiliate.approved');
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "type" :  "license.activated",\n  "id": 1 }';
    expect((await post(body, sign(body))).status).toBe(200);
    expect((await post(body, sign(JSON.stringify(JSON.parse(body))))).status).toBe(401);
  });

  it('verifies non-ASCII bodies as bytes', async () => {
    const body = JSON.stringify({ type: 'user.created', id: 1, name: 'Zoë 日本語' });
    expect((await post(body, sign(Buffer.from(body, 'utf8')))).status).toBe(200);
  });

  it('works with any content type', async () => {
    const body = JSON.stringify({ type: 'license.activated', id: 1 });
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it('accepts uppercase hex (compared case-insensitively)', async () => {
    const body = JSON.stringify({ type: 'license.activated', id: 1 });
    expect((await post(body, sign(body).toUpperCase())).status).toBe(200);
  });

  describe('rejects with 401', () => {
    const body = JSON.stringify({ type: 'license.activated', id: 1 });
    const good = sign(body);

    it('a missing signature header', async () => {
      expect((await post(body)).status).toBe(401);
    });
    it('an empty signature header', async () => {
      expect((await post(body, '')).status).toBe(401);
    });
    it('a signature made with the wrong secret', async () => {
      expect((await post(body, sign(body, 'other_secret'))).status).toBe(401);
    });
    it('a tampered body', async () => {
      expect((await post(body.replace('1', '2'), good)).status).toBe(401);
    });
    it('a truncated signature', async () => {
      expect((await post(body, good.slice(0, 62))).status).toBe(401);
    });
    it('a signature with a sha256= prefix', async () => {
      expect((await post(body, `sha256=${good}`)).status).toBe(401);
    });
    it('64 characters that are not all hex', async () => {
      expect((await post(body, `${good.slice(0, 63)}z`)).status).toBe(401);
    });
    it('an empty body', async () => {
      expect((await post('', good)).status).toBe(401);
    });
  });

  describe('after a valid signature', () => {
    it('returns 400 for invalid JSON', async () => {
      const body = 'not json';
      expect((await post(body, sign(body))).status).toBe(400);
    });
    it.each(['null', '42', '"text"', '[]', '{}', '{"type":5}'])('returns 400 for body %s', async (body) => {
      expect((await post(body, sign(body))).status).toBe(400);
    });
    it('ignores wrong-typed nested fields instead of failing', async () => {
      for (const extra of [{ objects: 'x' }, { objects: null }, { objects: [1] }, { id: { a: 1 } }]) {
        const body = JSON.stringify({ type: 'license.activated', ...extra });
        expect((await post(body, sign(body))).status).toBe(200);
      }
    });
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.FREEMIUS_WEBHOOK_SECRET;
    try {
      const body = '{"type":"license.activated"}';
      expect((await post(body, sign(body))).status).toBe(500);
    } finally {
      process.env.FREEMIUS_WEBHOOK_SECRET = SECRET;
    }
  });

  describe('verifyFreemiusSignature', () => {
    it('rejects non-string signatures', () => {
      expect(verifyFreemiusSignature(Buffer.from('x'), undefined, SECRET)).toBe(false);
      expect(verifyFreemiusSignature(Buffer.from('x'), ['a'], SECRET)).toBe(false);
    });
  });
});
