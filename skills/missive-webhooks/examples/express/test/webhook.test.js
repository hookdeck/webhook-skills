const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_missive_validation_secret';
process.env.MISSIVE_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

// Sign exactly as Missive does: 'sha256=' + hex(HMAC-SHA256(secret, raw body))
function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = {
  rule: { id: '45408b30-aa3a-45n1-bh67-0a0cb8da9080', description: 'Notify elfs', type: 'label_change' },
  conversation: {
    id: '47a57b76-df42-4d8k-927x-80dbe5d87191',
    subject: 'Mordor GPS coordinates',
    shared_labels: [{ id: '146ff5c4-d5la-3b63-b994-76711fn790lq', name: 'Elfs' }],
    shared_label_names: 'Elfs',
  },
  latest_message: {
    id: '86ef8bb8-269c-4959-a4f0-213db4e67844',
    subject: 'Fwd: Mordor GPS coordinates',
    type: 'email',
    from_field: { name: 'Samwise Gamgee', address: 'sam@fellowship.org' },
  },
};
const body = JSON.stringify(payload);

function post(raw, headers = {}) {
  return request(app).post('/webhooks/missive').set(headers).send(raw);
}

describe('Missive webhook', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid signature and handles label_change', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-hook-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Label change on "Mordor GPS coordinates"'));
  });

  it('accepts uppercase hex after the prefix', async () => {
    const header = 'sha256=' + sign(body).slice(7).toUpperCase();
    const res = await post(body, { 'content-type': 'application/json', 'x-hook-signature': header });
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await post(body, { 'content-type': 'text/plain', 'x-hook-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('acknowledges other rule types', async () => {
    const other = JSON.stringify({ ...payload, rule: { ...payload.rule, type: 'incoming_email' } });
    const res = await post(other, { 'content-type': 'application/json', 'x-hook-signature': sign(other) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Missive rule type: incoming_email'));
  });

  it('acknowledges a verified body without a rule (validation request)', async () => {
    const empty = '{}';
    const res = await post(empty, { 'content-type': 'application/json', 'x-hook-signature': sign(empty) });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong secret', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-hook-signature': sign(body, 'other') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(body.replace('Mordor', 'Gondor'), {
      'content-type': 'application/json',
      'x-hook-signature': sign(body),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('rejects a bare hex signature without the sha256= prefix', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-hook-signature': sign(body).slice(7) });
    expect(res.status).toBe(401);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-hook-signature': sign(body).slice(0, 39) });
    expect(res.status).toBe(401);
  });

  it('rejects 64 characters that are not all hex', async () => {
    const bad = 'sha256=g' + sign(body).slice(8);
    const res = await post(body, { 'content-type': 'application/json', 'x-hook-signature': bad });
    expect(res.status).toBe(401);
  });

  it('rejects a valid signature followed by junk', async () => {
    const res = await post(body, { 'content-type': 'application/json', 'x-hook-signature': sign(body) + 'zz' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const bad = '{not json';
    const res = await post(bad, { 'content-type': 'application/json', 'x-hook-signature': sign(bad) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.MISSIVE_WEBHOOK_SECRET;
    const res = await post(body, { 'content-type': 'application/json', 'x-hook-signature': sign(body) });
    process.env.MISSIVE_WEBHOOK_SECRET = SECRET;
    expect(res.status).toBe(500);
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
