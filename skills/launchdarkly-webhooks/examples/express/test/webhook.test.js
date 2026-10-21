const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_launchdarkly_secret';
process.env.LAUNCHDARKLY_WEBHOOK_SECRET = SECRET;

const { app, verifyLaunchDarklyWebhook } = require('../src/index');

// LaunchDarkly: HMAC-SHA256 hex digest of the raw body
function sign(payload, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function entry(kind, action = 'updateOn') {
  return JSON.stringify({
    _id: '57c0a8e29969090743529965',
    date: 1472243938774,
    accesses: [{ action, resource: 'proj/alexis:env/test' }],
    kind,
    name: 'Testing',
    titleVerb: 'changed the name of',
  });
}

describe('verifyLaunchDarklyWebhook', () => {
  const body = Buffer.from(entry('flag'));

  it('accepts a valid signature', () => {
    expect(verifyLaunchDarklyWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects wrong secret, missing header, and length mismatch', () => {
    expect(verifyLaunchDarklyWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyLaunchDarklyWebhook(body, undefined, SECRET)).toBe(false);
    expect(verifyLaunchDarklyWebhook(body, 'abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/launchdarkly', () => {
  const post = (body, sig) => {
    const r = request(app).post('/webhooks/launchdarkly').set('Content-Type', 'application/json');
    if (sig) r.set('X-LD-Signature', sig);
    return r.send(body);
  };

  it.each(['flag', 'segment', 'project', 'environment', 'member'])('accepts signed %s event', async (kind) => {
    const body = entry(kind);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = entry('flag');
    const res = await post(body, sign(body, 'wrong'));
    expect(res.status).toBe(400);
  });

  it('rejects an unsigned delivery', async () => {
    const res = await post(entry('flag'));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = entry('flag');
    const res = await post(body.replace('Testing', 'Hacked'), sign(body));
    expect(res.status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });
});
