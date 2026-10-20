const request = require('supertest');
const crypto = require('crypto');

// Sumsub webhook secret keys are plain strings (generated in the Webhook manager
// or set by you) used verbatim as the HMAC key - no prefix, no base64 decoding.
process.env.SUMSUB_WEBHOOK_SECRET = 'test_sumsub_secret_key';

const { app, verifySumsubWebhook } = require('../src/index');

const SECRET = process.env.SUMSUB_WEBHOOK_SECRET;

const ALGS = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

/** Compute x-payload-digest the way Sumsub does: hex HMAC of the raw body */
function sign(payload, digestAlg = 'HMAC_SHA256_HEX', secret = SECRET) {
  return crypto.createHmac(ALGS[digestAlg], secret).update(payload).digest('hex');
}

function post(payload, headers = {}) {
  let req = request(app).post('/webhooks/sumsub').set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return req.send(payload);
}

function signedPost(payload, digestAlg = 'HMAC_SHA256_HEX') {
  return post(payload, {
    'x-payload-digest': sign(payload, digestAlg),
    'x-payload-digest-alg': digestAlg,
  });
}

// Fixed vectors computed independently with `openssl dgst -<alg> -hmac test_sumsub_secret_key`
const KAT_BODY = '{"applicantId":"5cb56e8e0a975a35f333cb83","type":"applicantReviewed","reviewResult":{"reviewAnswer":"GREEN"},"reviewStatus":"completed"}';
const KAT = {
  HMAC_SHA1_HEX: '3112408230968a6ecbbca1c55cc5f7746efd3e62',
  HMAC_SHA256_HEX: '88db922f6fc43f1fa954665cd829cf69a558aba0dd1f0b1d0e58158add7d927f',
  HMAC_SHA512_HEX: 'ae5044f070fbb6a7db99dff0577baf422df66a251e516cc00b550193133a81786f1c4b284280dbbe38bb2efbc5d1c1a6b5897a22f495c90c93f7c5df6ff54c3c',
};

describe('verifySumsubWebhook', () => {
  const body = Buffer.from(KAT_BODY);

  it.each(Object.keys(KAT))('matches the known digest for %s', (alg) => {
    expect(verifySumsubWebhook(body, KAT[alg], alg, SECRET)).toBe(true);
  });

  it('defaults to SHA256 when x-payload-digest-alg is absent', () => {
    expect(verifySumsubWebhook(body, KAT.HMAC_SHA256_HEX, undefined, SECRET)).toBe(true);
    expect(verifySumsubWebhook(body, KAT.HMAC_SHA1_HEX, undefined, SECRET)).toBe(false);
  });

  it('rejects a digest computed with a different algorithm than announced', () => {
    expect(verifySumsubWebhook(body, KAT.HMAC_SHA1_HEX, 'HMAC_SHA256_HEX', SECRET)).toBe(false);
    expect(verifySumsubWebhook(body, KAT.HMAC_SHA256_HEX, 'HMAC_SHA512_HEX', SECRET)).toBe(false);
  });

  it('rejects an unknown algorithm', () => {
    expect(verifySumsubWebhook(body, KAT.HMAC_SHA256_HEX, 'HMAC_MD5_HEX', SECRET)).toBe(false);
  });

  it('accepts an upper-case hex digest', () => {
    expect(verifySumsubWebhook(body, KAT.HMAC_SHA256_HEX.toUpperCase(), 'HMAC_SHA256_HEX', SECRET)).toBe(true);
  });

  it('rejects a wrong secret, tampered body, missing or truncated digest', () => {
    expect(verifySumsubWebhook(body, KAT.HMAC_SHA256_HEX, 'HMAC_SHA256_HEX', 'other_secret')).toBe(false);
    expect(verifySumsubWebhook(Buffer.from(KAT_BODY + ' '), KAT.HMAC_SHA256_HEX, 'HMAC_SHA256_HEX', SECRET)).toBe(false);
    expect(verifySumsubWebhook(body, undefined, 'HMAC_SHA256_HEX', SECRET)).toBe(false);
    expect(verifySumsubWebhook(body, KAT.HMAC_SHA256_HEX.slice(0, 40), 'HMAC_SHA256_HEX', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/sumsub', () => {
  it('returns 400 when x-payload-digest is missing', async () => {
    const res = await post(KAT_BODY);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid digest', async () => {
    const res = await post(KAT_BODY, {
      'x-payload-digest': 'deadbeef',
      'x-payload-digest-alg': 'HMAC_SHA256_HEX',
    });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for an unsupported algorithm', async () => {
    const res = await post(KAT_BODY, {
      'x-payload-digest': KAT.HMAC_SHA256_HEX,
      'x-payload-digest-alg': 'HMAC_MD5_HEX',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body was re-serialised after signing', async () => {
    const pretty = JSON.stringify(JSON.parse(KAT_BODY), null, 2);
    const res = await post(pretty, {
      'x-payload-digest': KAT.HMAC_SHA256_HEX,
      'x-payload-digest-alg': 'HMAC_SHA256_HEX',
    });
    expect(res.status).toBe(400);
  });

  it.each(Object.keys(ALGS))('accepts a valid %s delivery', async (alg) => {
    const res = await signedPost(KAT_BODY, alg);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('accepts a valid delivery without x-payload-digest-alg (SHA256)', async () => {
    const res = await post(KAT_BODY, { 'x-payload-digest': KAT.HMAC_SHA256_HEX });
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed but non-JSON body', async () => {
    const res = await signedPost('not json');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON');
  });

  const events = [
    { type: 'applicantCreated', reviewStatus: 'init' },
    { type: 'applicantPending', reviewStatus: 'pending' },
    { type: 'applicantReviewed', reviewStatus: 'completed', reviewResult: { reviewAnswer: 'GREEN' } },
    { type: 'applicantReviewed', reviewStatus: 'completed', reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'RETRY' } },
    { type: 'applicantOnHold', reviewStatus: 'onHold' },
    { type: 'applicantActionPending', applicantActionId: '65f0c0a1', reviewStatus: 'pending' },
    { type: 'applicantActionReviewed', applicantActionId: '65f0c0a1', reviewResult: { reviewAnswer: 'GREEN' } },
    { type: 'applicantReset', reviewStatus: 'init' },
    { type: 'applicantDeleted' },
    { type: 'applicantTagsChanged', testMode: true },
  ];

  it.each(events)('handles $type', async (event) => {
    const payload = JSON.stringify({
      applicantId: '5cb56e8e0a975a35f333cb83',
      externalUserId: 'user-123',
      levelName: 'id-and-liveness',
      sandboxMode: true,
      createdAtMs: '2026-10-20 13:23:19.111',
      clientId: 'coolClientId',
      ...event,
    });
    const res = await signedPost(payload);
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
