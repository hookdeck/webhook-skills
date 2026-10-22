const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'loop_test_secret_key';
process.env.LOOP_WEBHOOK_SECRET = SECRET;

const { app, verifyLoopSignature } = require('../src/index');

// Loop signs the raw body: base64(HMAC-SHA256(secret, body))
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function post(payload, { signature, contentType = 'application/json', secret } = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const req = request(app)
    .post('/webhooks/loop-returns')
    .set('Content-Type', contentType)
    .set('X-Loop-Signature', signature ?? sign(body, secret));
  return req.send(body);
}

const returnPayload = (trigger, extra = {}) => ({
  topic: 'return',
  trigger,
  shop_id: 12345,
  id: '1673',
  state: 'open',
  ...extra,
});

describe('verifyLoopSignature', () => {
  const body = Buffer.from('{"a":1}');

  it('accepts a valid signature', () => {
    expect(verifyLoopSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyLoopSignature(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(verifyLoopSignature(body, 'short', SECRET)).toBe(false);
  });

  it('rejects a missing signature or secret', () => {
    expect(verifyLoopSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyLoopSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/loop-returns', () => {
  it.each([
    'return.created',
    'return.updated',
    'return.closed',
    'return.processing.failed',
  ])('accepts %s', async (trigger) => {
    const res = await post(returnPayload(trigger));
    expect(res.status).toBe(200);
  });

  it.each(['label.created', 'label.updated'])('accepts %s', async (trigger) => {
    const res = await post({
      topic: 'label',
      trigger,
      id: 12345,
      carrier: 'USPS',
      tracking_number: '9400',
      label_status: 'in_transit',
    });
    expect(res.status).toBe(200);
  });

  it.each(['restock.requested', 'giftcard.requested', 'shipment.processed'])(
    'accepts %s',
    async (trigger) => {
      const res = await post({ topic: 'x', trigger, id: 1 });
      expect(res.status).toBe(200);
    }
  );

  it('accepts an unknown trigger', async () => {
    const res = await post(returnPayload('return.something_new'));
    expect(res.status).toBe(200);
  });

  it('verifies any content type, thanks to express.raw({ type: "*/*" })', async () => {
    const res = await post(returnPayload('return.created'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
    const res2 = await post(returnPayload('return.created'), {
      contentType: 'application/vnd.api+json',
    });
    expect(res2.status).toBe(200);
  });

  it('verifies the exact bytes, including escaped slashes', async () => {
    const body = '{"topic":"return","trigger":"return.created","note":"a\\/b"}';
    const res = await post(body);
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(returnPayload('return.created'), { signature: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(returnPayload('return.created'), { secret: 'wrong' });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const original = JSON.stringify(returnPayload('return.created'));
    const res = await post(JSON.stringify(returnPayload('return.closed')), {
      signature: sign(original),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/loop-returns')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(returnPayload('return.created')));
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });
});
