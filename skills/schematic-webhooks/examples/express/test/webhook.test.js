const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_schematic_webhook_secret';
process.env.SCHEMATIC_WEBHOOK_SECRET = SECRET;

const { app, verifySchematicSignature } = require('../src/index');

// Same algorithm as Schematic: hex HMAC-SHA256(secret, rawBody + "+" + timestamp)
function sign(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(body), Buffer.from('+'), Buffer.from(String(timestamp), 'latin1')]))
    .digest('hex');
}

const now = () => String(Math.floor(Date.now() / 1000));

function event(action, extra = {}) {
  return JSON.stringify({
    action,
    account_id: 'acct_test',
    environment_id: 'env_test',
    event_id: 'whe_' + crypto.randomBytes(6).toString('hex'),
    object_type: 'company',
    body: { id: 'comp_123', name: 'Acme é' },
    ...extra,
  });
}

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/schematic')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

function signed(body, ts = now(), secret = SECRET) {
  return {
    'X-Schematic-Webhook-Signature': sign(body, ts, secret),
    'X-Schematic-Webhook-Signature-Version': 'v1',
    'X-Schematic-Webhook-Timestamp': ts,
  };
}

describe('Schematic webhook endpoint', () => {
  afterEach(() => {
    delete process.env.SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS;
    process.env.SCHEMATIC_WEBHOOK_SECRET = SECRET;
  });

  it.each([
    'company.created',
    'user.created',
    'plan.created',
    'flag.updated',
    'subscription.trial.ended',
    'entitlement.limit.reached',
    'credit.purchase.success',
    'auto.topup.success',
  ])('accepts a validly signed %s event', async (action) => {
    const body = event(action);
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a dashboard test send with no event_id or X-Schematic-Webhook-Id', async () => {
    const body = JSON.stringify({ action: 'company.created', body: {} });
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    const body = event('company.updated');
    const res = await post(body, signed(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('verifies multi-byte UTF-8 bodies byte-for-byte', async () => {
    const body = event('company.updated', { body: { name: '日本語 ✓' } });
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const body = event('company.created');
    const headers = signed(body);
    headers['X-Schematic-Webhook-Signature'] = headers['X-Schematic-Webhook-Signature'].toUpperCase();
    expect((await post(body, headers)).status).toBe(200);
  });

  it('accepts old timestamps by default (retries resend the original)', async () => {
    const body = event('company.created');
    const old = String(Math.floor(Date.now() / 1000) - 86400);
    expect((await post(body, signed(body, old))).status).toBe(200);
  });

  it('rejects old timestamps when SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = event('company.created');
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect((await post(body, signed(body, old))).status).toBe(401);
    expect((await post(body, signed(body))).status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const body = event('company.created');
    const headers = signed(body);
    const res = await post(body.replace('Acme', 'Evil'), headers);
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event('company.created');
    expect((await post(body, signed(body, now(), 'other_secret'))).status).toBe(401);
  });

  it('rejects a signature over the timestamp first, body second', async () => {
    const body = event('company.created');
    const ts = now();
    const wrong = crypto.createHmac('sha256', SECRET).update(`${ts}+${body}`).digest('hex');
    const res = await post(body, {
      'X-Schematic-Webhook-Signature': wrong,
      'X-Schematic-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  it('rejects a different timestamp than the one signed', async () => {
    const body = event('company.created');
    const headers = signed(body, '1700000000');
    headers['X-Schematic-Webhook-Timestamp'] = '1700000001';
    expect((await post(body, headers)).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const body = event('company.created');
    const headers = signed(body);
    delete headers['X-Schematic-Webhook-Signature'];
    expect((await post(body, headers)).status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const body = event('company.created');
    const headers = signed(body);
    delete headers['X-Schematic-Webhook-Timestamp'];
    expect((await post(body, headers)).status).toBe(401);
  });

  it.each([
    ['too short', 'abcd'],
    ['non-hex', 'z'.repeat(64)],
    ['prefixed', 'sha256=' + 'a'.repeat(64)],
    ['too long', 'a'.repeat(66)],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    const body = event('company.created');
    const headers = signed(body);
    headers['X-Schematic-Webhook-Signature'] = sig;
    expect((await post(body, headers)).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.SCHEMATIC_WEBHOOK_SECRET;
    const body = event('company.created');
    expect((await post(body, signed(body))).status).toBe(500);
  });

  it('returns 400 for a verified body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, signed(body), 'text/plain')).status).toBe(400);
  });
});

describe('verifySchematicSignature', () => {
  it('uses the timestamp header string as received (latin1)', () => {
    const body = Buffer.from('{}');
    const ts = ' 1700000000 '; // never trimmed
    const sig = sign('{}', ts);
    expect(verifySchematicSignature(body, sig, ts, SECRET).valid).toBe(true);
    expect(verifySchematicSignature(body, sig, ts.trim(), SECRET).valid).toBe(false);
  });

  it('treats the secret as UTF-8 text, not hex or base64', () => {
    const hexLooking = 'deadbeefdeadbeef';
    const body = Buffer.from('{}');
    const sig = sign('{}', '1', hexLooking);
    expect(verifySchematicSignature(body, sig, '1', hexLooking).valid).toBe(true);
  });

  it('applies tolerance only when asked', () => {
    const body = Buffer.from('{}');
    const ts = String(Math.floor(Date.now() / 1000) - 1000);
    const sig = sign('{}', ts);
    expect(verifySchematicSignature(body, sig, ts, SECRET, 0).valid).toBe(true);
    expect(verifySchematicSignature(body, sig, ts, SECRET, 60).valid).toBe(false);
  });
});
