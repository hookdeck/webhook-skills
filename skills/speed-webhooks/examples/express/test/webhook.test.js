// Generated with: speed-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Speed secrets look like "wsec_" + base64(key bytes). The HMAC key is the
// decoded part after the prefix. SPEED_WEBHOOK_SECRET holds the value exactly
// as Speed shows it, wsec_ prefix included.
const KEY_BYTES = Buffer.from('speed-test-signing-key-0123456789');
const SECRET = `wsec_${KEY_BYTES.toString('base64')}`;

process.env.SPEED_WEBHOOK_SECRET = SECRET;

const { app, toStandardSecret } = require('../src/index');

/** Sign like Speed: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}")). */
function sign(rawBody, id, timestamp, key = KEY_BYTES) {
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

/** Headers for a delivery. `prefix` is 'webhook' (Speed) or 'svix' (fallback). */
function signedHeaders(rawBody, { id, timestamp, key, signature, prefix = 'webhook' } = {}) {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: signature ?? sign(rawBody, msgId, ts, key),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/speed').set(headers).send(rawBody);
}

const event = (eventType, object, extra = {}) => ({
  id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
  object: 'events',
  api_version: '2022-10-15',
  event_type: eventType,
  data: { object, ...extra },
  livemode: false,
  request: { id: 'req_1' },
  created: 1696847071760,
  modified: 1696847071760,
});

const paymentPaid = () =>
  event('payment.paid', {
    id: 'pi_abc123',
    object: 'payment',
    amount: 5000,
    currency: 'SATS',
    status: 'paid',
  });

beforeEach(() => {
  process.env.SPEED_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('secret handling', () => {
  it('turns a leading wsec_ into whsec_', () => {
    expect(toStandardSecret('wsec_abc=')).toBe('whsec_abc=');
  });

  it('leaves a whsec_ value as is', () => {
    expect(toStandardSecret('whsec_abc=')).toBe('whsec_abc=');
  });

  it('accepts a secret configured with the whsec_ prefix', async () => {
    process.env.SPEED_WEBHOOK_SECRET = `whsec_${KEY_BYTES.toString('base64')}`;
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });
});

describe('valid signatures', () => {
  it('accepts payment.paid', async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('payment.paid: pi_abc123 (5000 SATS'));
  });

  it('accepts payment.created', async () => {
    const body = JSON.stringify(event('payment.created', { id: 'pi_1', amount: 100, currency: 'SATS', status: 'unpaid' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('payment.created: pi_1'));
  });

  it('accepts payment.confirmed', async () => {
    const body = JSON.stringify(event('payment.confirmed', { id: 'pi_2', amount: 100, currency: 'SATS', status: 'paid' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('payment.confirmed: pi_2'));
  });

  it('accepts checkout_session.paid', async () => {
    const body = JSON.stringify(event('checkout_session.paid', { id: 'cs_1', status: 'paid' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('checkout_session.paid: cs_1'));
  });

  it('accepts withdraw.failed', async () => {
    const body = JSON.stringify(event('withdraw.failed', { id: 'wd_1', status: 'failed' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('withdraw.failed: wd_1'));
  });

  it('accepts a Connect event carrying data.account_id', async () => {
    const body = JSON.stringify(event('connect.completed', {}, { account_id: 'acct_1' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('connect.completed: acct_1'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('something.new', { id: 'x_1' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('verifies any content type (raw body is read for */*)', async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(paymentPaid());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('ignores other signature versions such as v1a', async () => {
    const body = JSON.stringify(paymentPaid());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1a,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('skips a retry: same event id, new webhook-id, timestamp and signature', async () => {
    const evt = paymentPaid();
    const body = JSON.stringify(evt);
    const first = await post(body, signedHeaders(body));
    const second = await post(body, signedHeaders(body, { timestamp: now() + 1 }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('svix-* header fallback', () => {
  it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a bad signature sent with svix-* headers', async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, signedHeaders(body, { prefix: 'svix', signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('prefers webhook-* headers when webhook-id is present', async () => {
    const body = JSON.stringify(paymentPaid());
    const headers = {
      ...signedHeaders(body),
      'svix-id': 'ignored',
      'svix-timestamp': '1',
      'svix-signature': 'v1,aW52YWxpZA==',
    };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, signedHeaders(body, { key: Buffer.from('another-endpoint-secret-01234567') }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(paymentPaid());
    const headers = signedHeaders(body);
    const res = await post(body.replace('5000', '9000'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(paymentPaid());
    const res = await post(
      body,
      signedHeaders(body, { key: Buffer.from(SECRET.slice('wsec_'.length), 'utf8') })
    );
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when SPEED_WEBHOOK_SECRET is not set', async () => {
    delete process.env.SPEED_WEBHOOK_SECRET;
    const body = JSON.stringify(paymentPaid());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
