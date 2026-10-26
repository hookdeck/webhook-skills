const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_primary_signature_key';
process.env.ONSHAPE_WEBHOOK_SECRET = SECRET;

const { app, verifyOnshapeSignature, isTimestampFresh } = require('../src/index');

const TS = '2024-05-05T23:46:29.284-0500';

// Generate a real Onshape signature: base64 HMAC-SHA256 of "<timestamp>.<raw body>"
function sign(body, timestamp = TS, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/onshape')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

function signed(body, timestamp = TS) {
  return {
    'X-onshape-webhook-timestamp': timestamp,
    'X-onshape-webhook-signature-primary': sign(body, timestamp),
  };
}

// Payloads as shown in Onshape's webhook docs
const ids = {
  workspaceId: '000000000000000000000000',
  elementId: '000000000000000000000000',
  webhookId: '000000000000000000000000',
  messageId: '000000000000000000000000',
  documentId: '000000000000000000000000',
};
const events = {
  'onshape.model.lifecycle.changed': { ...ids, data: 'Some data', versionId: '000000000000000000000000' },
  'onshape.model.translation.complete': { ...ids, data: 'Some data', userId: '000000000000000000000000', translationId: '000000000000000000000000' },
  'onshape.document.lifecycle.statechange': { ...ids, data: 'Some data', versionId: '000000000000000000000000', documentState: 'TRASH' },
  'onshape.document.lifecycle.created': { ...ids },
  'onshape.revision.created': { ...ids },
  'onshape.comment.create': { ...ids, commentId: '000000000000000000000000' },
  'onshape.user.lifecycle.updateappsettings': { ...ids, userId: '000000000000000000000000', clientId: '000000000000000000000000' },
  'webhook.register': { ...ids, data: 'Some data', versionId: '000000000000000000000000' },
  'webhook.ping': { ...ids, data: 'Some data', versionId: '000000000000000000000000' },
  'webhook.unregister': { ...ids },
};
const payload = (name) => JSON.stringify({ timestamp: TS, event: name, ...events[name] });

describe('verifyOnshapeSignature', () => {
  const body = Buffer.from(payload('onshape.model.lifecycle.changed'));

  it('accepts a valid signature', () => {
    expect(verifyOnshapeSignature(body, TS, sign(body.toString()), SECRET)).toBe(true);
  });

  it('signs the exact timestamp header value', () => {
    expect(verifyOnshapeSignature(body, TS + ' ', sign(body.toString()), SECRET)).toBe(false);
  });

  it('verifies raw bytes that are not valid UTF-8 text', () => {
    const raw = Buffer.concat([Buffer.from('{"a":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(TS), Buffer.from('.'), raw]))
      .digest('base64');
    expect(verifyOnshapeSignature(raw, TS, sig, SECRET)).toBe(true);
  });

  it('rejects a tampered body, wrong secret and missing values', () => {
    const sig = sign(body.toString());
    expect(verifyOnshapeSignature(Buffer.from(body.toString() + ' '), TS, sig, SECRET)).toBe(false);
    expect(verifyOnshapeSignature(body, TS, sig, 'other_key')).toBe(false);
    expect(verifyOnshapeSignature(body, undefined, sig, SECRET)).toBe(false);
    expect(verifyOnshapeSignature(body, TS, undefined, SECRET)).toBe(false);
    expect(verifyOnshapeSignature(body, TS, '', SECRET)).toBe(false);
    expect(verifyOnshapeSignature(body, TS, sig, undefined)).toBe(false);
  });

  it('rejects malformed signatures', () => {
    const sig = sign(body.toString());
    expect(verifyOnshapeSignature(body, TS, sig.slice(0, -1), SECRET)).toBe(false);
    expect(verifyOnshapeSignature(body, TS, '!' + sig.slice(1), SECRET)).toBe(false);
    expect(verifyOnshapeSignature(body, TS, 'sha256=' + sig, SECRET)).toBe(false);
    expect(verifyOnshapeSignature(body, TS, sig.toLowerCase(), SECRET)).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  const now = Date.parse('2024-05-05T23:46:29.284-0500');

  it('is off by default', () => {
    expect(isTimestampFresh('2000-01-01T00:00:00.000-0000', 0, now)).toBe(true);
    expect(isTimestampFresh('garbage', undefined, now)).toBe(true);
  });

  it('enforces the window when enabled', () => {
    expect(isTimestampFresh(TS, 300, now + 60 * 1000)).toBe(true);
    expect(isTimestampFresh(TS, 300, now + 10 * 60 * 1000)).toBe(false);
    expect(isTimestampFresh('not a date', 300, now)).toBe(false);
  });
});

describe('POST /webhooks/onshape', () => {
  afterEach(() => {
    delete process.env.ONSHAPE_WEBHOOK_TOLERANCE_SECONDS;
  });

  it.each(Object.keys(events))('accepts a signed %s event', async (name) => {
    const body = payload(name);
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = payload('webhook.ping');
    const res = await request(app)
      .post('/webhooks/onshape')
      .set('Content-Type', 'text/plain')
      .set(signed(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 401 when the signature is missing', async () => {
    const body = payload('webhook.ping');
    const res = await post(body, { 'X-onshape-webhook-timestamp': TS });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp header is missing', async () => {
    const body = payload('webhook.ping');
    const res = await post(body, { 'X-onshape-webhook-signature-primary': sign(body) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const body = payload('webhook.ping');
    const res = await post(body, { ...signed(body), 'X-onshape-webhook-signature-primary': sign('{}') });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered body', async () => {
    const body = payload('webhook.ping');
    const res = await post(body + ' ', signed(body));
    expect(res.status).toBe(401);
  });

  it('does not fall back to the secondary signature header', async () => {
    const body = payload('webhook.ping');
    const res = await post(body, {
      'X-onshape-webhook-timestamp': TS,
      'X-onshape-webhook-signature-secondary': sign(body),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, signed(body));
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const body = payload('webhook.ping');
    const res = await post(body, signed(body, '2001-01-01T00:00:00.000-0000'));
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when a tolerance is set', async () => {
    process.env.ONSHAPE_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = payload('webhook.ping');
    const res = await post(body, signed(body, '2001-01-01T00:00:00.000-0000'));
    expect(res.status).toBe(401);
  });
});
