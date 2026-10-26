const request = require('supertest');
const crypto = require('crypto');

// The HMAC Signature Key is a free-form string set on the webhook in Cloudsmith
process.env.CLOUDSMITH_WEBHOOK_SECRET = 'cloudsmith_test_signature_key';

const { app, verifyCloudsmithWebhook } = require('../src/index');

const secret = process.env.CLOUDSMITH_WEBHOOK_SECRET;

/**
 * Generate an X-Cloudsmith-Signature value the same way Cloudsmith does:
 * hex(HMAC-SHA1(signature key, rawBody))
 */
function generateCloudsmithSignature(payload, key) {
  return crypto.createHmac('sha1', key).update(payload).digest('hex');
}

function postSigned(payload, signature = generateCloudsmithSignature(payload, secret), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/cloudsmith')
    .set('Content-Type', contentType)
    .set('X-Cloudsmith-Signature', signature)
    .send(payload);
}

// Based on the package payload in Cloudsmith's docs
const event = (eventId, data = {}) =>
  JSON.stringify({
    data: {
      name: 'my-file.deb',
      namespace: 'my-org',
      repository: 'my-repo',
      format: 'raw',
      identifier_perm: 'xKYgfsOsboz6',
      stage_str: 'Fully Synchronised',
      status_str: 'Completed',
      ...data,
    },
    meta: {
      attempt_at: '2020-07-07T17:30:34.342167+00:00',
      event_at: '2020-07-07T17:30:34.296482+00:00',
      event_id: eventId,
      trigger_id: 'c0e2b63e-3d84-4d54-bd62-ae7d0b2764a7',
      webhook_id: 1,
    },
  });

describe('verifyCloudsmithWebhook', () => {
  const payload = Buffer.from(event('package.synced'));
  const valid = generateCloudsmithSignature(payload, secret);

  it('accepts a valid signature', () => {
    expect(verifyCloudsmithWebhook(payload, valid, secret)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyCloudsmithWebhook(payload, valid.toUpperCase(), secret)).toBe(true);
  });

  it('rejects a signature made with another key', () => {
    expect(verifyCloudsmithWebhook(payload, generateCloudsmithSignature(payload, 'other'), secret)).toBe(false);
  });

  it('rejects a modified body', () => {
    expect(verifyCloudsmithWebhook(Buffer.concat([payload, Buffer.from(' ')]), valid, secret)).toBe(false);
  });

  it('rejects a sha1= prefixed value', () => {
    expect(verifyCloudsmithWebhook(payload, `sha1=${valid}`, secret)).toBe(false);
  });

  it('rejects an HMAC-SHA256 signature', () => {
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyCloudsmithWebhook(payload, sig, secret)).toBe(false);
  });

  it('rejects a base64 encoded digest', () => {
    const sig = crypto.createHmac('sha1', secret).update(payload).digest('base64');
    expect(verifyCloudsmithWebhook(payload, sig, secret)).toBe(false);
  });

  it('rejects malformed values without decoding them', () => {
    expect(verifyCloudsmithWebhook(payload, 'abc', secret)).toBe(false);
    expect(verifyCloudsmithWebhook(payload, `${valid}00`, secret)).toBe(false);
    expect(verifyCloudsmithWebhook(payload, `${valid.slice(0, 38)}zz`, secret)).toBe(false);
    expect(verifyCloudsmithWebhook(payload, `${valid}\n`, secret)).toBe(false);
  });

  it('rejects missing or empty signature or secret', () => {
    expect(verifyCloudsmithWebhook(payload, undefined, secret)).toBe(false);
    expect(verifyCloudsmithWebhook(payload, '', secret)).toBe(false);
    expect(verifyCloudsmithWebhook(payload, valid, undefined)).toBe(false);
    expect(verifyCloudsmithWebhook(payload, valid, '')).toBe(false);
  });
});

describe('POST /webhooks/cloudsmith', () => {
  it.each([
    'ping',
    'package.created',
    'package.deleted',
    'package.failed',
    'package.quarantined',
    'package.released',
    'package.restored',
    'package.security_scanned',
    'package.synced',
    'package.syncing',
    'package.tags_updated',
  ])('accepts %s', async (eventId) => {
    const res = await postSigned(event(eventId));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts unknown events with 200', async () => {
    const res = await postSigned(event('package.something_new'));
    expect(res.status).toBe(200);
  });

  it('accepts the JSON Array payload format', async () => {
    const res = await postSigned(`[${event('package.created')}]`);
    expect(res.status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    const res = await postSigned(event('package.synced'), undefined, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const res = await postSigned(JSON.stringify({ data: 'nope', meta: ['x'] }));
    expect(res.status).toBe(200);
    const res2 = await postSigned(JSON.stringify({ data: { name: 5 }, meta: { event_id: 7 } }));
    expect(res2.status).toBe(200);
  });

  it('rejects a signed body that is not an object or array', async () => {
    expect((await postSigned('"text"')).status).toBe(400);
    expect((await postSigned('[1]')).status).toBe(400);
    expect((await postSigned('null')).status).toBe(400);
  });

  it('rejects an invalid signature with 401', async () => {
    const res = await postSigned(event('package.synced'), 'deadbeef');
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header with 401', async () => {
    const res = await request(app)
      .post('/webhooks/cloudsmith')
      .set('Content-Type', 'application/json')
      .send(event('package.synced'));
    expect(res.status).toBe(401);
  });

  it('rejects an empty body with 401', async () => {
    const res = await request(app)
      .post('/webhooks/cloudsmith')
      .set('X-Cloudsmith-Signature', generateCloudsmithSignature('', 'wrong'));
    expect(res.status).toBe(401);
  });

  it('rejects a body altered after signing', async () => {
    const body = event('package.synced');
    const res = await postSigned(body.replace('my-repo', 'other-repo'), generateCloudsmithSignature(body, secret));
    expect(res.status).toBe(401);
  });

  it('rejects a signed body that is not JSON', async () => {
    const res = await postSigned('payload=%7B%7D');
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
