const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_flagsmith_secret';
process.env.FLAGSMITH_WEBHOOK_SECRET = SECRET;

const { app, verifyFlagsmithSignature } = require('../src/index');

// Same algorithm as Flagsmith: hex HMAC-SHA256 of the body, keyed with the secret
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const flagUpdated = JSON.stringify({
  event_type: 'FLAG_UPDATED',
  data: {
    changed_by: 'user@domain.com',
    timestamp: '2021-06-18T07:50:26.595298Z',
    new_state: { enabled: true, feature: { id: 1, name: 'my_feature' } },
    previous_state: { enabled: false, feature: { id: 1, name: 'my_feature' } },
  },
});
const flagDeleted = JSON.stringify({
  event_type: 'FLAG_DELETED',
  data: { feature: { id: 1, name: 'my_feature' } },
});
const auditLog = JSON.stringify({
  event_type: 'AUDIT_LOG_CREATED',
  data: { log: 'New Flag / Remote Config created: my_feature', related_object_type: 'FEATURE' },
});
const identity = JSON.stringify({ identity: 'user_test', flags: [], traits: [], segments: [] });

describe('verifyFlagsmithSignature', () => {
  it('accepts a valid signature', () => {
    const body = Buffer.from(flagUpdated);
    expect(verifyFlagsmithSignature(body, sign(flagUpdated), SECRET)).toBe(true);
  });

  it('rejects a wrong secret, tampered body, wrong length and empty values', () => {
    const body = Buffer.from(flagUpdated);
    expect(verifyFlagsmithSignature(body, sign(flagUpdated, 'other'), SECRET)).toBe(false);
    expect(verifyFlagsmithSignature(Buffer.from(flagUpdated + ' '), sign(flagUpdated), SECRET)).toBe(false);
    expect(verifyFlagsmithSignature(body, 'abc', SECRET)).toBe(false);
    expect(verifyFlagsmithSignature(body, '', SECRET)).toBe(false);
    expect(verifyFlagsmithSignature(body, sign(flagUpdated), '')).toBe(false);
  });
});

describe('POST /webhooks/flagsmith', () => {
  const post = (body, signature, contentType = 'application/json') => {
    const req = request(app).post('/webhooks/flagsmith').set('Content-Type', contentType);
    if (signature !== undefined) req.set('X-Flagsmith-Signature', signature);
    return req.send(body);
  };

  it.each([
    ['FLAG_UPDATED', flagUpdated],
    ['FLAG_DELETED', flagDeleted],
    ['AUDIT_LOG_CREATED', auditLog],
    ['identity webhook', identity],
  ])('accepts a signed %s payload', async (_name, body) => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await post(flagUpdated, sign(flagUpdated), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts an unknown event type', async () => {
    const body = JSON.stringify({ event_type: 'SOMETHING_NEW', data: {} });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await post(flagUpdated);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(flagUpdated, sign(flagUpdated, 'wrong'));
    expect(res.status).toBe(400);
  });

  it('rejects a valid signature over different bytes', async () => {
    const res = await post(flagUpdated, sign(auditLog));
    expect(res.status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });
});
