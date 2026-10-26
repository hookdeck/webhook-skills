const crypto = require('crypto');
const request = require('supertest');

// Violet app secrets are 32 hex characters, used as UTF-8 (never hex-decoded)
const SECRET = '3c989fdb913d4dd99e832b08cf207102';
process.env.VIOLET_WEBHOOK_SECRET = SECRET;

const { app, verifyVioletSignature } = require('../src/index');

// Payloads based on the sample bodies in Violet's webhook docs
const merchantEnabled = {
  id: 10189,
  name: 'sample-store',
  platform: 'SHOPIFY',
  store_url: 'sample-store.myshopify.com',
  status: 'ACTIVE',
  default_currency: 'USD',
  connection_status: 'CONNECTED',
};
const transferSent = {
  id: 335500,
  payment_provider_id: 'tr_3RBesbK29KDiBVld0zLcELFW',
  payout_account_id: 11495,
  amount: 11428,
  currency: 'USD',
  status: 'SENT',
  payment_provider: 'STRIPE',
  related_orders: ['8035507'],
  errors: [],
};
const order = { id: 8035507, status: 'COMPLETED', currency: 'USD' };

// Violet signs only the raw body bytes: base64(HMAC-SHA256(secret, body))
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function send(topic, rawBody, { signature = sign(rawBody), contentType = 'application/json' } = {}) {
  let req = request(app).post('/webhooks/violet').set('Content-Type', contentType);
  if (topic !== null) req = req.set('X-Violet-Topic', topic);
  if (signature !== null) req = req.set('X-Violet-Hmac', signature);
  return req.send(rawBody);
}

// The 43rd character carries 4 digest bits and 2 stray bits: change only the stray bits
function withStrayBits(signature) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const index = alphabet.indexOf(signature[42]);
  const altered = alphabet[(index & ~3) | ((index + 1) & 3)];
  return signature.slice(0, 42) + altered + '=';
}

describe('Violet webhook verification', () => {
  let logSpy;
  let errorSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a MERCHANT_ENABLED event with a valid signature', async () => {
    const res = await send('MERCHANT_ENABLED', JSON.stringify(merchantEnabled));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith('MERCHANT_ENABLED: merchant 10189 "sample-store" (ACTIVE)');
  });

  it('accepts a TRANSFER_SENT event', async () => {
    const res = await send('TRANSFER_SENT', JSON.stringify(transferSent));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('TRANSFER_SENT: transfer 335500 11428 USD (SENT)');
  });

  it('accepts ORDER_COMPLETED and ORDER_SHIPPED events', async () => {
    for (const topic of ['ORDER_COMPLETED', 'ORDER_SHIPPED']) {
      const res = await send(topic, JSON.stringify(order));
      expect(res.status).toBe(200);
    }
    expect(logSpy).toHaveBeenCalledWith('ORDER_COMPLETED: order 8035507 (COMPLETED)');
  });

  it('verifies the exact bytes received, not a re-serialised body', async () => {
    const raw = '{\n  "id": 1,\n  "status":   "ACTIVE",  "note": "café ☃"\n}';
    const res = await send('MERCHANT_ENABLED', raw);
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await send('ORDER_UPDATED', JSON.stringify(order), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('logs and accepts topics it does not handle', async () => {
    const res = await send('PRODUCT_SYNC_COMPLETED', JSON.stringify({ id: 5 }));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled Violet topic: PRODUCT_SYNC_COMPLETED');
  });

  it('rejects a missing signature with 401', async () => {
    const res = await send('ORDER_UPDATED', JSON.stringify(order), { signature: null });
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature with 401', async () => {
    const res = await send('ORDER_UPDATED', JSON.stringify(order), { signature: '' });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const raw = JSON.stringify(order);
    const res = await send('ORDER_UPDATED', raw, { signature: sign(raw, 'another-secret') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const raw = JSON.stringify(order);
    const res = await send('ORDER_UPDATED', raw.replace('COMPLETED', 'FAILED'), { signature: sign(raw) });
    expect(res.status).toBe(401);
  });

  it('does not hex-decode the secret', async () => {
    const raw = JSON.stringify(order);
    const hexDecoded = Buffer.from(SECRET, 'hex');
    const signature = crypto.createHmac('sha256', hexDecoded).update(raw).digest('base64');
    const res = await send('ORDER_UPDATED', raw, { signature });
    expect(res.status).toBe(401);
  });

  it('rejects a hex digest and a prefixed value', async () => {
    const raw = JSON.stringify(order);
    const hex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    expect((await send('ORDER_UPDATED', raw, { signature: hex })).status).toBe(401);
    expect((await send('ORDER_UPDATED', raw, { signature: `sha256=${sign(raw)}` })).status).toBe(401);
  });

  it('rejects an unpadded or trailing-junk base64 value', async () => {
    const raw = JSON.stringify(order);
    const good = sign(raw);
    expect((await send('ORDER_UPDATED', raw, { signature: good.slice(0, -1) })).status).toBe(401);
    expect((await send('ORDER_UPDATED', raw, { signature: `${good}x` })).status).toBe(401);
  });

  it('rejects a base64 value whose last character carries stray low bits', async () => {
    const raw = JSON.stringify(order);
    const good = sign(raw);
    const stray = withStrayBits(good);
    // It decodes to the same digest bytes...
    expect(Buffer.from(stray, 'base64').equals(Buffer.from(good, 'base64'))).toBe(true);
    expect(stray).not.toBe(good);
    // ...but is not the string Violet sends, so it is rejected
    expect((await send('ORDER_UPDATED', raw, { signature: stray })).status).toBe(401);
  });

  it('returns 400 when X-Violet-Topic is missing', async () => {
    const res = await send(null, JSON.stringify(order));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const res = await send('ORDER_UPDATED', 'not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is not a JSON object', async () => {
    for (const raw of ['null', '[1,2]', '42', '"text"']) {
      const res = await send('ORDER_UPDATED', raw);
      expect(res.status).toBe(400);
    }
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const weird = { id: { nested: true }, status: ['ACTIVE'], name: 7, amount: '11428', currency: null };
    for (const topic of ['ORDER_UPDATED', 'MERCHANT_ENABLED', 'TRANSFER_SENT']) {
      const res = await send(topic, JSON.stringify(weird));
      expect(res.status).toBe(200);
    }
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.VIOLET_WEBHOOK_SECRET;
    try {
      const res = await send('ORDER_UPDATED', JSON.stringify(order));
      expect(res.status).toBe(500);
    } finally {
      process.env.VIOLET_WEBHOOK_SECRET = SECRET;
    }
  });
});

describe('verifyVioletSignature', () => {
  it('compares the whole header value in constant time', () => {
    const body = Buffer.from('{"id":1}');
    expect(verifyVioletSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyVioletSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyVioletSignature(body, ['a', 'b'], SECRET)).toBe(false);
  });
});
