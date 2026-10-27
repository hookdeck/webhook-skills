const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'yIRFMTpsBcAKKRjJPCIykNo6EkNxJn_nq01-_r3S8i4';
process.env.OPTIMIZELY_WEBHOOK_SECRET = SECRET;

const { app, verifyOptimizelySignature } = require('../src/index');

// Published test vector from Optimizely's docs (exact body bytes)
const VECTOR_BODY =
  '{"timestamp": 1558138293, "project_id": 11387641093, "data": {"cdn_url": "https://cdn.optimizely.com/datafiles/QMVJcUKEJZFg8pQ2jhAybK.json", "environment": "Production", "origin_url": "https://optimizely.s3.amazonaws.com/datafiles/QMVJcUKEJZFg8pQ2jhAybK.json", "revision": 13}, "event": "project.datafile_updated"}';
const VECTOR_HEADER = 'sha1=b2493723c6ea6973fbda41573222c8ecb1c82666';

// Sign like Optimizely: sha1= + hex(HMAC-SHA1(secret, raw body))
function sign(body, secret = SECRET) {
  return 'sha1=' + crypto.createHmac('sha1', secret).update(body).digest('hex');
}

// Documented sample payload
const datafilePayload = JSON.stringify({
  project_id: 1234,
  timestamp: 1468447113,
  event: 'project.datafile_updated',
  data: {
    revision: 1,
    origin_url: 'https://optimizely.s3.amazonaws.com/json/1234.json',
    cdn_url: 'https://cdn.optimizely.com/json/1234.json',
    environment: 'Production',
  },
});

// Illustrative change-history payload (data is an array of change records)
const rulesetPayload = JSON.stringify({
  project_id: 1234,
  timestamp: 1468447200,
  event: 'project.ruleset_updated',
  data: [{ change_type: 'update', entity: { type: 'ruleset' } }],
});

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/optimizely')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('verifyOptimizelySignature', () => {
  it('accepts the published test vector', () => {
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY), VECTOR_HEADER, SECRET)).toBe(true);
  });

  it('accepts the bare digest without the sha1= prefix', () => {
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY), VECTOR_HEADER.slice(5), SECRET)).toBe(true);
  });

  it('accepts an uppercase digest', () => {
    const header = 'sha1=' + VECTOR_HEADER.slice(5).toUpperCase();
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY), header, SECRET)).toBe(true);
  });

  it('rejects a tampered body, wrong secret and malformed values', () => {
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY + ' '), VECTOR_HEADER, SECRET)).toBe(false);
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY), VECTOR_HEADER, 'wrong')).toBe(false);
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY), 'sha1=abc', SECRET)).toBe(false);
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY), 'sha1=' + 'zz'.repeat(20), SECRET)).toBe(false);
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY), '', SECRET)).toBe(false);
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY), undefined, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/optimizely', () => {
  it('accepts the published test vector', async () => {
    const res = await post(VECTOR_BODY, { 'X-Hub-Signature': VECTOR_HEADER });
    expect(res.status).toBe(200);
  });

  it('accepts a signed datafile_updated event', async () => {
    const res = await post(datafilePayload, { 'X-Hub-Signature': sign(datafilePayload) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed ruleset_updated event', async () => {
    const res = await post(rulesetPayload, { 'X-Hub-Signature': sign(rulesetPayload) });
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await request(app)
      .post('/webhooks/optimizely')
      .set('Content-Type', 'text/plain')
      .set('X-Hub-Signature', sign(datafilePayload))
      .send(datafilePayload);
    expect(res.status).toBe(200);
  });

  it('returns 401 for a missing signature', async () => {
    expect((await post(datafilePayload)).status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await post(datafilePayload, { 'X-Hub-Signature': sign(datafilePayload, 'other_secret') });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    expect((await post(datafilePayload, { 'X-Hub-Signature': 'sha1=nothex' })).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Hub-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('logs and accepts unknown events', async () => {
    const body = JSON.stringify({ event: 'project.something_else', data: {} });
    const res = await post(body, { 'X-Hub-Signature': sign(body) });
    expect(res.status).toBe(200);
  });
});
