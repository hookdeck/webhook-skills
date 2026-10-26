const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'whsec_paypercut_test_secret_Key-123';
process.env.PAYPERCUT_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyPaypercutSignature } = require('../src/index');

// Signed exactly as Paypercut signs: hex HMAC-SHA256(secret, `${t}.${rawBody}`)
function sign(body, t = String(Math.floor(Date.now() / 1000)), secret = SECRET) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const v1 = crypto.createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${t}.`), bytes])).digest('hex');
  return { t, v1, header: `t=${t},v1=${v1}` };
}

const payment = JSON.stringify({ type: 'payment.succeeded', data: { id: 'pay_123', amount: 1000 } });
const URL = '/webhooks/paypercut';

afterEach(() => {
  delete process.env.PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS;
});

describe('verifyPaypercutSignature', () => {
  it('accepts a valid signature, and uppercase hex', () => {
    const { header, v1 } = sign(payment);
    expect(verifyPaypercutSignature(Buffer.from(payment), header, SECRET, 0)).toBe(true);
    expect(verifyPaypercutSignature(Buffer.from(payment), header.replace(v1, v1.toUpperCase()), SECRET, 0)).toBe(true);
  });

  it('accepts when any v1 entry matches and ignores other keys', () => {
    const { t, v1 } = sign(payment);
    const bad = 'a'.repeat(64);
    expect(verifyPaypercutSignature(Buffer.from(payment), `t=${t},v1=${bad},v0=zzz,v1=${v1}`, SECRET, 0)).toBe(true);
  });

  it('uses t exactly as sent (no number reformatting)', () => {
    const { header } = sign(payment, '0001768991448');
    expect(verifyPaypercutSignature(Buffer.from(payment), header, SECRET, 0)).toBe(true);
  });

  it('rejects tampered body, wrong secret, missing t, missing v1 and junk', () => {
    const { header, t, v1 } = sign(payment);
    expect(verifyPaypercutSignature(Buffer.from(payment + ' '), header, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(Buffer.from(payment), header, 'other', 0)).toBe(false);
    expect(verifyPaypercutSignature(Buffer.from(payment), `v1=${v1}`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(Buffer.from(payment), `t=,v1=${v1}`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(Buffer.from(payment), `t=${t}`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(Buffer.from(payment), `t=${t},v1=${v1}00`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(Buffer.from(payment), `t=${t},v1=${v1.slice(0, 62)}zz`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(Buffer.from(payment), undefined, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(Buffer.from(payment), '', SECRET, 0)).toBe(false);
  });

  it('applies the tolerance only when it is set', () => {
    const old = sign(payment, String(Math.floor(Date.now() / 1000) - 3600));
    expect(verifyPaypercutSignature(Buffer.from(payment), old.header, SECRET, 0)).toBe(true);
    expect(verifyPaypercutSignature(Buffer.from(payment), old.header, SECRET, 300)).toBe(false);
    const fresh = sign(payment);
    expect(verifyPaypercutSignature(Buffer.from(payment), fresh.header, SECRET, 300)).toBe(true);
  });
});

describe('POST /webhooks/paypercut', () => {
  it('accepts a signed payment.succeeded event', async () => {
    const res = await request(app)
      .post(URL)
      .set('Content-Type', 'application/json')
      .set('Paypercut-Signature', sign(payment).header)
      .send(payment);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('works with any content type and verifies the exact bytes', async () => {
    const odd = '{"type":"payout.paid",  "data":{"id":"po_1"}}\n'; // odd whitespace must survive
    const res = await request(app)
      .post(URL)
      .set('Content-Type', 'text/plain')
      .set('Paypercut-Signature', sign(odd).header)
      .send(odd);
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const body = JSON.stringify({ type: 'person.created', data: { id: 'p_1' } });
    const res = await request(app)
      .post(URL)
      .set('Content-Type', 'application/json')
      .set('Paypercut-Signature', sign(body).header)
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing, malformed or mismatched signature with 401', async () => {
    const send = (sig) => {
      const r = request(app).post(URL).set('Content-Type', 'application/json');
      return (sig ? r.set('Paypercut-Signature', sig) : r).send(payment);
    };
    expect((await send()).status).toBe(401);
    expect((await send('garbage')).status).toBe(401);
    expect((await send(sign(payment, undefined, 'wrong-secret').header)).status).toBe(401);
    expect((await send(sign(payment + 'x').header)).status).toBe(401);
  });

  it('returns 400 for a verified body that is not an event', async () => {
    for (const body of ['not json', '{"data":{}}', '[]']) {
      const res = await request(app)
        .post(URL)
        .set('Content-Type', 'application/json')
        .set('Paypercut-Signature', sign(body).header)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it('dedupes on Paypercut-Delivery-Id', async () => {
    const send = () =>
      request(app)
        .post(URL)
        .set('Content-Type', 'application/json')
        .set('Paypercut-Delivery-Id', 'del_dedupe_1')
        .set('Paypercut-Signature', sign(payment).header)
        .send(payment);
    expect((await send()).body.duplicate).toBeUndefined();
    expect((await send()).body.duplicate).toBe(true);
  });

  it('rejects an old timestamp only when a tolerance is configured', async () => {
    const old = sign(payment, String(Math.floor(Date.now() / 1000) - 3600)).header;
    const send = () =>
      request(app).post(URL).set('Content-Type', 'application/json').set('Paypercut-Signature', old).send(payment);
    expect((await send()).status).toBe(200);
    process.env.PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await send()).status).toBe(401);
  });
});

describe('other HTTP methods', () => {
  it('verifies a bodyless GET over zero bytes and acknowledges it', async () => {
    const res = await request(app).get(URL).set('Paypercut-Signature', sign('').header);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects an unsigned GET', async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it.each(['put', 'patch'])('accepts a signed %s with a body', async (method) => {
    const res = await request(app)
      [method](URL)
      .set('Content-Type', 'application/json')
      .set('Paypercut-Signature', sign(payment).header)
      .send(payment);
    expect(res.status).toBe(200);
  });

  it('accepts a signed bodyless DELETE', async () => {
    const res = await request(app).delete(URL).set('Paypercut-Signature', sign('').header);
    expect(res.status).toBe(200);
  });
});

describe('configuration', () => {
  it('fails closed with 500 when the secret is not set', async () => {
    delete process.env.PAYPERCUT_WEBHOOK_SECRET;
    const res = await request(app)
      .post(URL)
      .set('Content-Type', 'application/json')
      .set('Paypercut-Signature', sign(payment).header)
      .send(payment);
    process.env.PAYPERCUT_WEBHOOK_SECRET = SECRET;
    expect(res.status).toBe(500);
  });
});
