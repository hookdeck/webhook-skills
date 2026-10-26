const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'k3Jx9QmVt2LwZp8RaYb5NcHd7UfGs1EoXi4TyWn6AvBq0CrMlD'; // 50-char Campfire token

process.env.CAMPFIRE_WEBHOOK_SECRET = SECRET;
delete process.env.CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS;

const { app, verifyCampfireSignature } = require('../src/index');

// Same algorithm as Campfire: HMAC-SHA256(secret, "{timestamp}:{raw body}"), hex.
function sign(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(':'), Buffer.from(body)]))
    .digest('hex');
}

const nowTs = () => String(Math.floor(Date.now() / 1000));

function post(body, { timestamp = nowTs(), signature, contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/campfire').set('Content-Type', contentType);
  if (timestamp !== null) req.set('Campfire-Webhook-Request-Timestamp', timestamp);
  const sig = signature === undefined ? sign(body, timestamp) : signature;
  if (sig !== null) req.set('Campfire-Webhook-Signature-v1', sig);
  return req.send(body);
}

const invoicePaid = JSON.stringify({
  webhook_uuid: '3c88df19-1c1f-4b1c-b4a7-768793055a60',
  topic: 'Invoice.paid',
  data: { id: 12345, invoice_number: 'INV-1042', payment_status: 'paid', amount_paid: 1500.0 },
  changes: { payment_status: { old: 'open', new: 'paid' } },
});

describe('Campfire webhook endpoint', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a valid signature and handles Invoice.paid', async () => {
    const res = await post(invoicePaid);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith('Invoice paid: 12345');
  });

  it('handles Invoice.created, Bill.created and logs unknown topics', async () => {
    for (const [topic, line] of [
      ['Invoice.created', 'Invoice created: 7 (INV-7)'],
      ['Bill.created', 'Bill created: 7'],
      ['Contract.updated', 'Unhandled Campfire topic: Contract.updated'],
    ]) {
      const body = JSON.stringify({ webhook_uuid: 'u', topic, data: { id: 7, invoice_number: 'INV-7' }, changes: null });
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(line);
    }
  });

  it('handles *.deleted payloads that carry only an id', async () => {
    const body = JSON.stringify({ webhook_uuid: 'u', topic: 'Bill.deleted', data: { id: 99 }, changes: null });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Bill.deleted: 99');
  });

  it('verifies the exact bytes whatever the content type', async () => {
    const res = await post(invoicePaid, { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('verifies a body with unusual whitespace and key order untouched', async () => {
    const body = '{ "topic" :"Invoice.paid",\n "data":{"id":1},  "changes":null }';
    const res = await post(body);
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex (compared case-insensitively)', async () => {
    const ts = nowTs();
    const res = await post(invoicePaid, { timestamp: ts, signature: sign(invoicePaid, ts).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(invoicePaid, { signature: null })).status).toBe(401);
  });

  it('rejects a missing or empty timestamp header', async () => {
    const sig = sign(invoicePaid, '1770000000');
    expect((await post(invoicePaid, { timestamp: null, signature: sig })).status).toBe(401);
    expect((await post(invoicePaid, { timestamp: '', signature: sig })).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await post(invoicePaid, { signature: '' })).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const ts = nowTs();
    const res = await post(invoicePaid, { timestamp: ts, signature: sign(invoicePaid, ts, 'x'.repeat(50)) });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const ts = nowTs();
    const res = await post(invoicePaid.replace('1500', '1'), { timestamp: ts, signature: sign(invoicePaid, ts) });
    expect(res.status).toBe(401);
  });

  it('rejects when the timestamp header does not match what was signed', async () => {
    const res = await post(invoicePaid, { timestamp: nowTs(), signature: sign(invoicePaid, '1770000000') });
    expect(res.status).toBe(401);
  });

  it('rejects a dot-joined message (the separator is a colon)', async () => {
    const ts = nowTs();
    const dotSig = crypto.createHmac('sha256', SECRET).update(`${ts}.${invoicePaid}`).digest('hex');
    expect((await post(invoicePaid, { timestamp: ts, signature: dotSig })).status).toBe(401);
  });

  it('rejects prefixed, truncated, non-hex and over-long signatures', async () => {
    const ts = nowTs();
    const good = sign(invoicePaid, ts);
    for (const bad of [`sha256=${good}`, good.slice(0, 62), good + 'aa', 'z'.repeat(64), `${good.slice(0, 63)}g`]) {
      const res = await post(invoicePaid, { timestamp: ts, signature: bad });
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default (retries and replays keep them)', async () => {
    const res = await post(invoicePaid, { timestamp: '1770000000' });
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(invoicePaid, { timestamp: '1770000000' })).status).toBe(401);
    expect((await post(invoicePaid)).status).toBe(200);
  });

  it('exposes a pure verifier that rejects a missing secret', () => {
    const ts = nowTs();
    const headers = {
      'campfire-webhook-request-timestamp': ts,
      'campfire-webhook-signature-v1': sign(invoicePaid, ts),
    };
    expect(verifyCampfireSignature(Buffer.from(invoicePaid), headers, SECRET)).toBe(true);
    expect(verifyCampfireSignature(Buffer.from(invoicePaid), headers, '')).toBe(false);
  });
});
