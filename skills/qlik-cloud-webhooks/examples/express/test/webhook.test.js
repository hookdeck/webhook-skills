const crypto = require('crypto');
const request = require('supertest');

// Qlik Cloud secrets are 32-64 characters, used as UTF-8 bytes (not decoded).
const SECRET = 'qlik-test-secret-0123456789abcdefghijklmn';
process.env.QLIK_CLOUD_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyQlikSignature } = app;

// Signed exactly as Qlik Cloud signs: lowercase hex HMAC-SHA256 of the raw body bytes.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Payloads as shown in Qlik's docs (qlik.dev/apis/event)
const reloadFinished = {
  id: 'b347fd0d-1321-417f-91ee-90e96c76389c',
  time: '2018-10-30T07:06:22Z',
  type: 'com.qlik.v1.reload.finished',
  source: 'com.qlik/reloads',
  specversion: '1.0',
  datacontenttype: 'application/json',
  tenantid: 'UkeLb6ICti8OA8f3LueRI5kVNtuHc15f',
  data: {
    id: '6a849f7f18ec290e6ceb025d',
    appId: '002ff8c5-3c11-4464-a22b-68fb5e7ee5e8',
    userId: '5be59decca62aa00097268a4',
    succeeded: true,
  },
};

const changeStoreSaved = {
  id: 'id123',
  time: '2018-10-30T07:06:22Z',
  type: 'com.qlik.analytics.change-store.changes.saved',
  source: 'com.qlik/write-table',
  specversion: '1.0',
  data: { storeId: 'store012', spaceId: 'space123', committedAt: '2024-01-01T12:20:00Z' },
};

// Pre-hybrid payload (the help page's example): only eventType, data.attributes
const legacyAppDeleted = {
  cloudEventsVersion: '0.1',
  source: 'com.qlik/engine',
  contentType: 'application/json',
  eventId: 'e65c1481-e8a-4be-a5ca-27dfcde077d7',
  eventTime: '2021-03-08T14:51:29Z',
  eventTypeVersion: '1.0.0',
  eventType: 'com.qlik.v1.app.deleted',
  extensions: { tenantId: 'oZcMPa_1PwH4FUdrh6839YHHdEJN' },
  data: { attributes: { id: '0984fec4-aa8c-4253-b1d1-4fd4f9c78', name: 'New App' } },
};

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/qlik-cloud').set('Content-Type', contentType);
  if (signature !== undefined) req.set('qlik-signature', signature);
  return req.send(body);
}

describe('verifyQlikSignature', () => {
  const body = Buffer.from(JSON.stringify(reloadFinished));

  it('accepts a valid lowercase hex signature', () => {
    expect(verifyQlikSignature(body, sign(body))).toBe(true);
  });

  it('accepts uppercase hex (hex is case-insensitive)', () => {
    expect(verifyQlikSignature(body, sign(body).toUpperCase())).toBe(true);
  });

  it('verifies over zero bytes for an empty body', () => {
    expect(verifyQlikSignature(Buffer.alloc(0), sign(Buffer.alloc(0)))).toBe(true);
  });

  it('rejects a missing, empty or non-string signature', () => {
    expect(verifyQlikSignature(body, undefined)).toBe(false);
    expect(verifyQlikSignature(body, '')).toBe(false);
    expect(verifyQlikSignature(body, ['a'])).toBe(false);
  });

  it('rejects a wrong length, non-hex characters or a prefix', () => {
    const good = sign(body);
    expect(verifyQlikSignature(body, good.slice(0, 63))).toBe(false);
    expect(verifyQlikSignature(body, good + '0')).toBe(false);
    expect(verifyQlikSignature(body, 'z'.repeat(64))).toBe(false);
    expect(verifyQlikSignature(body, `sha256=${good}`)).toBe(false);
    expect(verifyQlikSignature(body, `${good}\n`)).toBe(false);
  });

  it('rejects a signature made with another secret or over other bytes', () => {
    expect(verifyQlikSignature(body, sign(body, 'x'.repeat(40)))).toBe(false);
    expect(verifyQlikSignature(Buffer.from(JSON.stringify(reloadFinished, null, 2)), sign(body))).toBe(false);
  });

  it('fails closed when no secret is configured', () => {
    expect(verifyQlikSignature(body, sign(body), '')).toBe(false);
  });
});

describe('POST /webhooks/qlik-cloud', () => {
  it('accepts a signed reload.finished event', async () => {
    const body = JSON.stringify(reloadFinished);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed change-store event it does not handle explicitly', async () => {
    const body = JSON.stringify(changeStoreSaved);
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('accepts a signed legacy payload that carries only eventType', async () => {
    const body = JSON.stringify(legacyAppDeleted);
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('verifies the exact bytes, so reformatted JSON needs its own signature', async () => {
    const compact = JSON.stringify(reloadFinished);
    const pretty = JSON.stringify(reloadFinished, null, 2);
    expect((await post(pretty, sign(compact))).status).toBe(401);
    expect((await post(pretty, sign(pretty))).status).toBe(200);
  });

  it('accepts any content type', async () => {
    const body = JSON.stringify(reloadFinished);
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
    expect((await post(body, sign(body), 'application/cloudevents+json')).status).toBe(200);
  });

  it('rejects a missing, malformed or wrong signature with 401', async () => {
    const body = JSON.stringify(reloadFinished);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, '')).status).toBe(401);
    expect((await post(body, 'abc')).status).toBe(401);
    expect((await post(body, sign(body).replace(/.$/, (c) => (c === '0' ? '1' : '0')))).status).toBe(401);
    expect((await post(body, sign(body, 'y'.repeat(40)))).status).toBe(401);
  });

  it('rejects a body changed after signing', async () => {
    const body = JSON.stringify(reloadFinished);
    expect((await post(body.replace('true', 'false'), sign(body))).status).toBe(401);
  });

  it('answers 400 for a verified body that is not a JSON object', async () => {
    const notJson = 'not json';
    expect((await post(notJson, sign(notJson), 'text/plain')).status).toBe(400);
    const arr = '[1,2]';
    expect((await post(arr, sign(arr))).status).toBe(400);
  });

  it('verifies non-UTF-8 bytes as bytes', async () => {
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x80]);
    const res = await post(bytes, sign(bytes), 'application/octet-stream');
    expect(res.status).toBe(400); // verified (not 401), but not JSON
  });

  it('ignores wrong-typed fields instead of failing with 500', async () => {
    for (const payload of [
      { type: 42, data: 'x' },
      { type: 'com.qlik.v1.reload.finished', data: [1, 2] },
      { type: 'com.qlik.v1.app.deleted', data: { attributes: 'nope', id: 7 } },
      { eventType: { a: 1 }, data: null },
      {},
    ]) {
      const body = JSON.stringify(payload);
      expect((await post(body, sign(body))).status).toBe(200);
    }
  });
});

describe('other methods', () => {
  it('acknowledges a signed GET with no body (verified over zero bytes)', async () => {
    const res = await request(app).get('/webhooks/qlik-cloud').set('qlik-signature', sign(Buffer.alloc(0)));
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned GET', async () => {
    expect((await request(app).get('/webhooks/qlik-cloud')).status).toBe(401);
  });

  it.each(['put', 'patch', 'delete'])('accepts a signed %s with a body', async (method) => {
    const body = JSON.stringify(reloadFinished);
    const res = await request(app)[method]('/webhooks/qlik-cloud')
      .set('Content-Type', 'application/json')
      .set('qlik-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });
});

describe('configuration', () => {
  it('returns 500 when the secret is not set', async () => {
    delete process.env.QLIK_CLOUD_WEBHOOK_SECRET;
    try {
      const body = JSON.stringify(reloadFinished);
      expect((await post(body, sign(body))).status).toBe(500);
    } finally {
      process.env.QLIK_CLOUD_WEBHOOK_SECRET = SECRET;
    }
  });
});
