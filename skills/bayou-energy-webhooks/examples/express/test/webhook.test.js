// Generated with: bayou-energy-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Bayou secrets look like "whsec_" + base64(key bytes), for example
// "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('bayou-test-signing-key-0123456789').toString('base64');

process.env.BAYOU_ENERGY_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Bayou does (Standard Webhooks). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature } = {}) {
  const msgId = id || `wh_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/bayou-energy').set(headers).send(rawBody);
}

const bill = () => ({
  id: 12345,
  external_id: 'BILL_123',
  status: 'unlocked',
  customer_id: 123456,
  customer_external_id: 'MSCOTT123',
  utility: 'con_edison',
  total_amount: 12000,
});

beforeEach(() => {
  process.env.BAYOU_ENERGY_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('test vector', () => {
  it("reproduces the signature from Bayou's verification docs", () => {
    const body = '{"event": "bills_ready", "object": {"id": 123456}}';
    const sig = sign(body, 'wh_12345', '1750000000', 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw');
    expect(sig).toBe('v1,yW3priuFZD+w+ji8R847LYfQxOKmZlBAHEt7OQP0CMI=');
  });
});

describe('valid signatures', () => {
  it('accepts new_bill', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('New bill 12345'));
  });

  it('accepts updated_bill', async () => {
    const body = JSON.stringify({ event: 'updated_bill', object: bill() });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Updated bill 12345'));
  });

  it('accepts bills_ready', async () => {
    const body = JSON.stringify({
      event: 'bills_ready',
      object: { id: 12345, external_id: 'MSCOTT123', bills_parsed: [bill()] },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('1 parsed'));
  });

  it('accepts intervals_ready', async () => {
    const body = JSON.stringify({
      event: 'intervals_ready',
      object: {
        id: 12345,
        external_id: 'MSCOTT123',
        first_interval_discovered: '2022-07-01T00:00:00Z',
        last_interval_discovered: '2022-07-31T00:00:00Z',
        available_data: { account_numbers: [] },
      },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Intervals ready'));
  });

  it('accepts customer_has_filled_credentials', async () => {
    const body = JSON.stringify({
      event: 'customer_has_filled_credentials',
      object: { id: 12345, external_id: 'MSCOTT123', utility: 'con_edison', has_filled_credentials: true },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('con_edison'));
  });

  it('accepts new_unparsed_bill', async () => {
    const body = JSON.stringify({
      event: 'new_unparsed_bill',
      object: { id: 12345, external_id: 'BILL_123', status: 'unparsed', customer_id: 12345, utility: 'con_edison' },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('unparsed bill 12345'));
  });

  it('accepts customer_must_reauthenticate', async () => {
    const body = JSON.stringify({
      event: 'customer_must_reauthenticate',
      object: { id: 12345, external_id: 'MSCOTT123', reason: 'mfa_factor_has_expired' },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('mfa_factor_has_expired'));
  });

  it('acknowledges unknown events with 200', async () => {
    const body = JSON.stringify({ event: 'something_new', object: {} });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts a non-JSON content type (raw body is verified)', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const headers = { ...signedHeaders(body), 'content-type': 'text/plain' };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const id = `wh_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    const other = 'whsec_' + Buffer.from('another-company-secret-0123456').toString('base64');
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const headers = signedHeaders(body);
    const res = await post(body.replace('12000', '99999'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const id = 'wh_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when BAYOU_ENERGY_WEBHOOK_SECRET is not set', async () => {
    delete process.env.BAYOU_ENERGY_WEBHOOK_SECRET;
    const body = JSON.stringify({ event: 'new_bill', object: bill() });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
