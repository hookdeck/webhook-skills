const crypto = require('crypto');
const request = require('supertest');

process.env.COMPLYCUBE_WEBHOOK_SECRET = 'complycube_test_webhook_secret';
const { app, verifyComplyCubeSignature } = require('../src/index');

const SECRET = process.env.COMPLYCUBE_WEBHOOK_SECRET;

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Shape taken from ComplyCube's documented sample event
function makeEvent(type, resourceType = 'check') {
  return JSON.stringify({
    id: '5ed170fe99c81a0007b9a3d3',
    type,
    resourceType,
    payload: {
      id: '5ed3918fbf06f30008e552c9',
      outcome: 'clear',
      status: 'complete',
      createdAt: '2020-01-01T11:14:23.964Z',
      updatedAt: '2020-01-01T11:14:23.964Z',
    },
    createdAt: '2020-01-01T11:14:23.964Z',
  });
}

const body = makeEvent('check.completed.clear');

function post(payload, headers = {}) {
  return request(app).post('/webhooks/complycube').set('Content-Type', 'application/json').set(headers).send(payload);
}

describe('verifyComplyCubeSignature', () => {
  it('accepts a valid signature, in either hex case', () => {
    expect(verifyComplyCubeSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
    expect(verifyComplyCubeSignature(Buffer.from(body), sign(body).toUpperCase(), SECRET)).toBe(true);
  });
  it('rejects wrong secret, missing header, bad hex, wrong length, prefix', () => {
    expect(verifyComplyCubeSignature(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), '', SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), 'abcd', SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), 'sha256=' + sign(body), SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), sign(body) + 'zz', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/complycube', () => {
  it.each([
    ['check.completed.clear', 'check'],
    ['check.completed', 'check'],
    ['check.failed', 'check'],
    ['client.created', 'client'],
    ['workflow.session.completed', 'workflowSession'],
    ['address.created', 'address'],
  ])('accepts a signed %s event', async (type, resourceType) => {
    const payload = makeEvent(type, resourceType);
    const res = await post(payload, { 'ComplyCube-Signature': sign(payload) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies the exact bytes, including non-compact JSON and other content types', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    const res = await request(app)
      .post('/webhooks/complycube')
      .set('Content-Type', 'text/plain')
      .set('ComplyCube-Signature', sign(pretty))
      .send(pretty);
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned request with 401', async () => {
    expect((await post(body)).status).toBe(401);
  });

  it('rejects a bad signature with 401', async () => {
    expect((await post(body, { 'ComplyCube-Signature': sign(body, 'wrong') })).status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    expect((await post(body, { 'ComplyCube-Signature': 'not-hex' })).status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const res = await post(body.replace('clear', 'rejected'), { 'ComplyCube-Signature': sign(body) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    expect((await post(bad, { 'ComplyCube-Signature': sign(bad) })).status).toBe(400);
  });

  it.each(['null', '42', '{"id":"x"}'])('returns 400 for a signed body that is not an event: %s', async (bad) => {
    expect((await post(bad, { 'ComplyCube-Signature': sign(bad) })).status).toBe(400);
  });
});
