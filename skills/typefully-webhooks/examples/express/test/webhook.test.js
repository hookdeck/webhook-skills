const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'typefully_test_secret';
process.env.TYPEFULLY_WEBHOOK_SECRET = SECRET;

const { app, verifyTypefully } = require('../src/index');

const payload = (event = 'draft.created') =>
  JSON.stringify({ event, data: { id: 12345, social_set_id: 67890, status: 'draft', draft_title: 'Weekly Newsletter' } });

// Same algorithm as Typefully: HMAC-SHA256 hex of "<timestamp>.<body>", sent as "sha256=<hex>"
function sign(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

const now = () => String(Math.floor(Date.now() / 1000));

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/typefully')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('Typefully webhook', () => {
  afterEach(() => {
    delete process.env.TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a valid sha256= signature', async () => {
    const body = payload();
    const ts = now();
    const res = await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the bare digest and uppercase hex', async () => {
    const body = payload('draft.published');
    const ts = now();
    const hex = sign(body, ts);
    expect((await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': hex })).status).toBe(200);
    expect((await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': `sha256=${hex.toUpperCase()}` })).status).toBe(200);
  });

  it('verifies the exact raw bytes, including whitespace and non-ASCII', async () => {
    const body = '{ "event" : "draft.created",\n "data": {"id": 1, "draft_title": "Café ☕"} }';
    const ts = now();
    const res = await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(200);
  });

  it('works with a non-JSON content type', async () => {
    const body = payload();
    const ts = now();
    const res = await request(app)
      .post('/webhooks/typefully')
      .set('Content-Type', 'text/plain')
      .set({ 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': `sha256=${sign(body, ts)}` })
      .send(body);
    expect(res.status).toBe(200);
  });

  it.each(['draft.planned', 'draft.scheduled', 'draft.status_changed', 'draft.tags_changed', 'draft.deleted'])(
    'handles %s',
    async (event) => {
      const body = payload(event);
      const ts = now();
      const res = await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': `sha256=${sign(body, ts)}` });
      expect(res.status).toBe(200);
    }
  );

  it('rejects a missing signature', async () => {
    expect((await post(payload(), { 'X-Typefully-Timestamp': now() })).status).toBe(401);
  });

  it('rejects a missing timestamp', async () => {
    const body = payload();
    const res = await post(body, { 'X-Typefully-Signature': `sha256=${sign(body, now())}` });
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures', async () => {
    const body = payload();
    const ts = now();
    const good = sign(body, ts);
    for (const bad of ['sha256=', 'sha256=zz', `sha256=${good.slice(1)}`, `sha256=${good}00`, `sha256=${good.slice(0, 63)}g`, 'sha1=' + good]) {
      const res = await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': bad });
      expect(res.status).toBe(401);
    }
  });

  it('rejects a tampered body, a different timestamp, and a wrong secret', async () => {
    const body = payload();
    const ts = now();
    const sig = `sha256=${sign(body, ts)}`;
    expect((await post(body.replace('12345', '99999'), { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': sig })).status).toBe(401);
    expect((await post(body, { 'X-Typefully-Timestamp': String(Number(ts) + 1), 'X-Typefully-Signature': sig })).status).toBe(401);
    const forged = `sha256=${sign(body, ts, 'other_secret')}`;
    expect((await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': forged })).status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const ts = now();
    const res = await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const body = payload();
    const ts = String(Math.floor(Date.now() / 1000) - 86400);
    const res = await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when the tolerance is set, and accepts fresh ones', async () => {
    process.env.TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = payload();
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect((await post(body, { 'X-Typefully-Timestamp': old, 'X-Typefully-Signature': `sha256=${sign(body, old)}` })).status).toBe(401);
    const ts = now();
    expect((await post(body, { 'X-Typefully-Timestamp': ts, 'X-Typefully-Signature': `sha256=${sign(body, ts)}` })).status).toBe(200);
  });

  it('verifyTypefully works on Buffers directly', () => {
    const body = Buffer.from(payload());
    const ts = now();
    expect(verifyTypefully(body, ts, `sha256=${sign(body.toString(), ts)}`, SECRET)).toBe(true);
    expect(verifyTypefully(body, ts, '', SECRET)).toBe(false);
    expect(verifyTypefully(body, ts, `sha256=${sign(body.toString(), ts)}`, '')).toBe(false);
  });
});
