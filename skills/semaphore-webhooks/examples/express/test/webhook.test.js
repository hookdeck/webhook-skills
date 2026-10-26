const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'semaphore-test-secret';
process.env.SEMAPHORE_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifySemaphoreSignature } = require('../src/index');

// Signed exactly as Semaphore signs: lowercase hex HMAC-SHA256 of the raw body, no prefix.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Trimmed from the payload in Semaphore's notification docs.
const pipelineDone = (result = 'passed') => ({
  version: '1.0.0',
  organization: { name: 'semaphore', id: '36360e31-fee6-42b2-9f6c-999d4c06ce81' },
  project: { name: 'notifications', id: '91e34570-bebe-42b6-b47a-ca710b2b8927' },
  repository: { url: 'https://github.com/semaphoreci/myproject', slug: 'semaphoreci/notifications' },
  revision: { reference: 'refs/heads/rw/webhook_impl', commit_sha: '2d9f5fcec1ca7c68fa7bd44dd58ec4ff65814563' },
  workflow: { id: 'acabe58e-4bcc-4d39-be06-e98d71917703' },
  pipeline: { id: 'fa02c7bd-7a8b-42e0-8d6e-aa0d8a194e19', name: 'Notificaitons', state: 'done', result },
  blocks: [{ name: 'Lint', result, jobs: [{ name: 'Lint', status: 'finished', result }] }],
});

const URL = '/webhooks/semaphore';

function post(body, headers = {}) {
  return request(app).post(URL).set('Content-Type', 'application/json').set(headers).send(body);
}

describe('verifySemaphoreSignature', () => {
  const body = Buffer.from('{"a":1}');

  it('accepts a valid hex signature, in either case', () => {
    expect(verifySemaphoreSignature(body, sign(body))).toBe(true);
    expect(verifySemaphoreSignature(body, sign(body).toUpperCase())).toBe(true);
  });

  it('rejects wrong secret, tampered body and missing signature', () => {
    expect(verifySemaphoreSignature(body, sign(body, 'other'))).toBe(false);
    expect(verifySemaphoreSignature(Buffer.from('{"a":2}'), sign(body))).toBe(false);
    expect(verifySemaphoreSignature(body, undefined)).toBe(false);
    expect(verifySemaphoreSignature(body, '')).toBe(false);
  });

  it('rejects malformed values: prefix, wrong length, non-hex', () => {
    expect(verifySemaphoreSignature(body, `sha256=${sign(body)}`)).toBe(false);
    expect(verifySemaphoreSignature(body, sign(body).slice(0, 63))).toBe(false);
    expect(verifySemaphoreSignature(body, sign(body) + 'a')).toBe(false);
    expect(verifySemaphoreSignature(body, 'z'.repeat(64))).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifySemaphoreSignature(body, sign(body, ''), '')).toBe(false);
  });
});

describe('POST /webhooks/semaphore', () => {
  it.each(['passed', 'failed', 'stopped', 'canceled'])('accepts a signed %s pipeline', async (result) => {
    const body = JSON.stringify(pipelineDone(result));
    const res = await post(body, {
      'X-Semaphore-Signature-256': sign(body),
      'X-Semaphore-Webhook-Id': 'b1f2c3d4',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an unknown result without failing', async () => {
    const body = JSON.stringify(pipelineDone('something-new'));
    const res = await post(body, { 'X-Semaphore-Signature-256': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not a re-serialized body', async () => {
    const body = JSON.stringify(pipelineDone(), null, 2);
    const ok = await post(body, { 'X-Semaphore-Signature-256': sign(body) });
    expect(ok.status).toBe(200);
    const reserialized = await post(body, {
      'X-Semaphore-Signature-256': sign(JSON.stringify(JSON.parse(body))),
    });
    expect(reserialized.status).toBe(401);
  });

  it('accepts any content type', async () => {
    const body = JSON.stringify(pipelineDone());
    const res = await request(app)
      .post(URL)
      .set('Content-Type', 'text/plain')
      .set('X-Semaphore-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing, wrong, malformed or prefixed signature with 401', async () => {
    const body = JSON.stringify(pipelineDone());
    expect((await post(body)).status).toBe(401);
    expect((await post(body, { 'X-Semaphore-Signature-256': sign(body, 'wrong') })).status).toBe(401);
    expect((await post(body, { 'X-Semaphore-Signature-256': 'abc' })).status).toBe(401);
    expect((await post(body, { 'X-Semaphore-Signature-256': `sha256=${sign(body)}` })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(pipelineDone('passed'));
    const res = await post(body.replace('passed', 'failed'), { 'X-Semaphore-Signature-256': sign(body) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not a JSON object', async () => {
    for (const body of ['not json', '[1,2]']) {
      const res = await post(body, { 'X-Semaphore-Signature-256': sign(body) });
      expect(res.status).toBe(400);
    }
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.SEMAPHORE_WEBHOOK_SECRET;
    try {
      const body = JSON.stringify(pipelineDone());
      const res = await post(body, { 'X-Semaphore-Signature-256': sign(body) });
      expect(res.status).toBe(500);
    } finally {
      process.env.SEMAPHORE_WEBHOOK_SECRET = SECRET;
    }
  });
});

describe('other HTTP methods', () => {
  it.each(['get', 'put', 'patch', 'delete'])('verifies and acknowledges a signed %s', async (method) => {
    const body = JSON.stringify(pipelineDone());
    const res = await request(app)
      [method](URL)
      .set('Content-Type', 'application/json')
      .set('X-Semaphore-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it.each(['get', 'delete'])('verifies an empty %s over zero bytes and returns 200', async (method) => {
    const res = await request(app)[method](URL).set('X-Semaphore-Signature-256', sign(''));
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned GET with 401', async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });
});
