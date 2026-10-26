const request = require('supertest');
const crypto = require('crypto');

// BigMailer signing secrets are opaque strings; these are only for tests
const SECRET = 'test_bigmailer_secret_3c9e1f7a';
const OLD_SECRET = 'old_bigmailer_secret_81d4b6e2';
process.env.BIGMAILER_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

const now = () => Math.floor(Date.now() / 1000);

// Matches BigMailer's header format: t=<unix>,v1=<hex>[,v1=<hex>]
function sign(body, { timestamp = now(), secret = SECRET } = {}) {
  const hmac = (key) => crypto.createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${hmac(secret)}`;
}

const ids = {
  brand_id: '0da934ea-f96f-4f2f-85dd-0e8ceb9cba0e',
  campaign_id: '9ebe0652-6364-4688-897c-cf2655f988e8',
  contact_id: 'f36999a4-7fc0-4a03-868c-21fad154db1b',
};

// Payloads follow the sample payloads in BigMailer's webhook event type docs
const base = { date: 1579811821, campaign_id: ids.campaign_id, contact_id: ids.contact_id, email: 'test@example.com' };
const samples = {
  bounce: { ...base, type: 'hard' },
  click: { ...base, link_id: 'a1f82283-aa9a-4de8-a803-3860a4df1ce4', url: 'https://www.example.com/' },
  complaint: base,
  open: base,
  unsubscribe: {
    ...base,
    unsubscribe_all: false,
    unsubscribe_ids: ['48e7b6d6-4c2f-4819-9294-41aaed22f837', 'aa3f3b4c-862e-4a00-aadb-0d82e4def938'],
  },
};

function event(type) {
  return JSON.stringify({ type, brand_id: ids.brand_id, [type]: samples[type] ?? base });
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/bigmailer')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('BigMailer webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS;
    process.env.BIGMAILER_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => jest.restoreAllMocks());

  describe('signature verification', () => {
    it('accepts a valid v1 signature', async () => {
      const body = event('bounce');
      const res = await post(body, { 'X-BigMailer-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the documented header example shape', async () => {
      const body = event('open');
      const header = sign(body);
      expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
      expect((await post(body, { 'X-BigMailer-Signature': header })).status).toBe(200);
    });

    it('accepts when any v1 entry matches (key rotation), first or last', async () => {
      const body = event('click');
      const t = now();
      const mac = (key) => crypto.createHmac('sha256', key).update(`${t}.${body}`).digest('hex');
      const first = `t=${t},v1=${mac(SECRET)},v1=${mac(OLD_SECRET)}`;
      const last = `t=${t},v1=${mac(OLD_SECRET)},v1=${mac(SECRET)}`;
      expect((await post(body, { 'X-BigMailer-Signature': first })).status).toBe(200);
      expect((await post(body, { 'X-BigMailer-Signature': last })).status).toBe(200);
    });

    it('ignores other schemes such as v0', async () => {
      const body = event('open');
      const t = now();
      const mac = crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
      expect((await post(body, { 'X-BigMailer-Signature': `t=${t},v0=${mac}` })).status).toBe(401);
      expect((await post(body, { 'X-BigMailer-Signature': `t=${t},v0=${'0'.repeat(64)},v1=${mac}` })).status).toBe(200);
    });

    it('accepts uppercase hex', async () => {
      const body = event('open');
      const t = now();
      const mac = crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex').toUpperCase();
      expect((await post(body, { 'X-BigMailer-Signature': `t=${t},v1=${mac}` })).status).toBe(200);
    });

    it('signs the t string exactly as sent (no numeric re-formatting)', async () => {
      const body = event('open');
      const t = '0001492774578';
      const mac = crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
      expect((await post(body, { 'X-BigMailer-Signature': `t=${t},v1=${mac}` })).status).toBe(200);
    });

    it('verifies the exact bytes, including non-ASCII and whitespace', async () => {
      const body = '{"type":"open",  "open":{"email":"zoë@example.com"}}\n';
      expect((await post(body, { 'X-BigMailer-Signature': sign(body) })).status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = event('open');
      const res = await request(app)
        .post('/webhooks/bigmailer')
        .set('Content-Type', 'text/plain')
        .set('X-BigMailer-Signature', sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = event('bounce');
      expect((await post(body, { 'X-BigMailer-Signature': sign(body, { secret: 'wrong_secret' }) })).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await post(event('complaint'), { 'X-BigMailer-Signature': sign(event('open')) });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered timestamp', async () => {
      const body = event('open');
      const header = sign(body).replace(/t=\d+/, `t=${now() + 1}`);
      expect((await post(body, { 'X-BigMailer-Signature': header })).status).toBe(401);
    });

    it('rejects a missing or empty signature header', async () => {
      expect((await post(event('open'))).status).toBe(401);
      expect((await post(event('open'), { 'X-BigMailer-Signature': '' })).status).toBe(401);
    });

    it('rejects a header without t', async () => {
      const body = event('open');
      const mac = crypto.createHmac('sha256', SECRET).update(`.${body}`).digest('hex');
      expect((await post(body, { 'X-BigMailer-Signature': `v1=${mac}` })).status).toBe(401);
    });

    it.each([
      'garbage',
      't=abc,v1=deadbeef',
      't=123',
      'v1=deadbeef',
      't=123,v1=short',
      `t=123,v1=${'z'.repeat(64)}`,
      `t=123,v1=${'a'.repeat(63)}`,
      `t=123,v1=${'a'.repeat(65)}`,
    ])('rejects malformed header %j without throwing', async (header) => {
      expect((await post(event('open'), { 'X-BigMailer-Signature': header })).status).toBe(401);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.BIGMAILER_WEBHOOK_SECRET;
      const body = event('open');
      expect((await post(body, { 'X-BigMailer-Signature': sign(body) })).status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = now() - 3600;

    it('is off by default: an hour-old timestamp with a valid signature is accepted', async () => {
      const body = event('open');
      expect((await post(body, { 'X-BigMailer-Signature': sign(body, { timestamp: old }) })).status).toBe(200);
    });

    it('rejects old timestamps when BIGMAILER_WEBHOOK_TOLERANCE_SECONDS is positive', async () => {
      process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('open');
      expect((await post(body, { 'X-BigMailer-Signature': sign(body, { timestamp: old }) })).status).toBe(401);
    });

    it('accepts fresh timestamps when the tolerance is set', async () => {
      process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('open');
      expect((await post(body, { 'X-BigMailer-Signature': sign(body) })).status).toBe(200);
    });

    it('treats a non-numeric value as off', async () => {
      process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
      const body = event('open');
      expect((await post(body, { 'X-BigMailer-Signature': sign(body, { timestamp: old }) })).status).toBe(200);
    });
  });

  describe('event handling', () => {
    it.each(['bounce', 'click', 'complaint', 'open', 'unsubscribe'])('handles %s', async (type) => {
      const body = event(type);
      const res = await post(body, { 'X-BigMailer-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    });

    it('reads the bounce kind from bounce.type, not the event type', async () => {
      const body = event('bounce');
      await post(body, { 'X-BigMailer-Signature': sign(body) });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Bounce (hard) for test@example.com'));
    });

    it('acknowledges unhandled events', async () => {
      const body = JSON.stringify({ type: 'delivery', brand_id: ids.brand_id });
      const res = await post(body, { 'X-BigMailer-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled event: delivery');
    });

    it('rejects a validly signed body that is not JSON', async () => {
      const body = 'not json';
      expect((await post(body, { 'X-BigMailer-Signature': sign(body) })).status).toBe(400);
    });

    it.each(['[]', 'null', '"text"', '42'])('rejects a validly signed non-object body %s', async (body) => {
      expect((await post(body, { 'X-BigMailer-Signature': sign(body) })).status).toBe(400);
    });

    it.each([
      { type: 'open', open: 'oops' },
      { type: 'open', open: null },
      { type: 'open', open: [] },
      { type: 'click', click: 5 },
      { type: 'unsubscribe', unsubscribe: { unsubscribe_ids: 'nope', unsubscribe_all: 'yes' } },
      { type: 'bounce', bounce: { type: { nested: true }, email: ['x'] } },
      { type: 42 },
      { type: null },
      {},
    ])('does not 500 on wrong-typed fields %j', async (payload) => {
      const body = JSON.stringify(payload);
      const res = await post(body, { 'X-BigMailer-Signature': sign(body) });
      expect(res.status).toBe(200);
    });
  });
});
