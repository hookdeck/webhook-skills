const crypto = require('node:crypto');
const request = require('supertest');
const { app, verifySignature, getEventNames } = require('../src/index');
const vector = require('../vector.json');
const prefix = null;
const timestamped = false;
const field = "event";

function sign(body, secret = vector.secret, timestamp = '1721856000') {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const message = timestamped ? Buffer.concat([Buffer.from(timestamp + '.'), bytes]) : bytes;
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return timestamped ? `t=${timestamp},v1=${digest}` : (prefix || '') + digest;
}
function send(body, signature = sign(body), contentType = 'application/json') {
  const req = request(app).post('/webhooks/dub').set('Content-Type', contentType);
  if (signature !== null) req.set('dub-signature', signature);
  return req.send(body);
}
beforeEach(() => {
  process.env.DUB_WEBHOOK_SECRET = vector.secret;
  process.env.DUB_WEBHOOK_TOLERANCE_SECONDS = '0';
  process.env.UPPROMOTE_WEBHOOK_TOPIC = 'link.created';
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

test('accepts the independent fixed core-compatible vector and routes its event', async () => {
  expect(verifySignature(Buffer.from(vector.body), vector.signature, vector.secret)).toBe(true);
  expect(getEventNames(JSON.parse(vector.body))).toEqual(vector.events);
  expect((await send(vector.body, vector.signature)).status).toBe(200);
  expect(console.log).toHaveBeenCalledWith(expect.any(String), vector.events[0]);
});
test('verifies exact bytes with whitespace, Unicode and arbitrary content type', async () => {
  expect((await send(vector.body, vector.signature, 'application/octet-stream')).status).toBe(200);
  expect((await send(vector.body + ' ', vector.signature)).status).toBe(401);
  expect((await send(vector.body, sign(vector.body, 'wrong-secret'))).status).toBe(401);
  const binary = Buffer.from([0xff, 0x00, 0xc3, 0x28]);
  expect(verifySignature(binary, sign(binary), vector.secret)).toBe(true);
  expect(verifySignature(Buffer.from(binary.toString('utf8')), sign(binary), vector.secret)).toBe(false);
});
test('rejects missing and malformed signatures without throwing', async () => {
  expect((await send(vector.body, null)).status).toBe(401);
  for (const value of ['', 'abc', 'g'.repeat(64), '0'.repeat(63), '0'.repeat(65), vector.signature + 'garbage']) {
    expect(verifySignature(Buffer.from(vector.body), value, vector.secret)).toBe(false);
  }
  const digest = sign(vector.body).split('=').pop();
  expect(verifySignature(Buffer.from(vector.body), digest + '\n', vector.secret)).toBe(false);
});
test('accepts case-insensitive hex', async () => {
  const signature = vector.signature.replace(/[0-9a-f]{64}/g, (digest) => digest.toUpperCase());
  expect((await send(vector.body, signature)).status).toBe(200);
});
test('missing server secret fails closed', async () => {
  delete process.env.DUB_WEBHOOK_SECRET;
  expect((await send(vector.body)).status).toBe(500);
});
test('signed invalid JSON returns 400 after authentication', async () => {
  expect((await send('{broken')).status).toBe(400);
  expect((await send('{broken', vector.signature)).status).toBe(401);
});
test.each([null, [], 1, true, 'text'])('signed non-object JSON %j returns 400', async (payload) => {
  expect((await send(JSON.stringify(payload))).status).toBe(400);
});
test('unexpected nested field types and unknown events never cause 5xx', async () => {
  for (const value of [null, [], 1, true, 'unknown.event', { type: null }, { type: [] }, { toString: null }]) {
    const payload = JSON.parse(vector.body);
    for (const key of [field?.split('.')[0], 'event', 'identification', 'data', 'resourceType'].filter(Boolean)) payload[key] = value;
    expect((await send(JSON.stringify(payload))).status).toBe(200);
  }
  expect((await send('{}')).status).toBe(200);
});
if (prefix === 'v1=' || timestamped) {
  test('accepts any matching v1 during rotation and ignores unknown versions', () => {
    const digest = vector.signature.split('=').pop();
    const start = timestamped ? 't=1721856000, ' : '';
    expect(verifySignature(Buffer.from(vector.body), start + 'v1=' + '0'.repeat(64) + ', v1=' + digest, vector.secret)).toBe(true);
    expect(verifySignature(Buffer.from(vector.body), start + 'v0=' + digest, vector.secret)).toBe(false);
    expect(verifySignature(Buffer.from(vector.body), start + 'v1=bad, v1=' + digest, vector.secret)).toBe(true);
  });
}
if (prefix === 'v1=' || prefix === 'sha256=') {
  test('accepts core-compatible bare digests', () => {
    expect(verifySignature(Buffer.from(vector.body), vector.signature.split('=').pop(), vector.secret)).toBe(true);
  });
}
if (timestamped) {
  test('requires one numeric timestamp and preserves its exact text', () => {
    const body = Buffer.from(vector.body);
    expect(verifySignature(body, sign(body, vector.secret, '001721856000'), vector.secret)).toBe(true);
    for (const header of ['v1=' + vector.signature.split('=').pop(), 't=x,' + vector.signature, vector.signature + ',t=1721856000']) {
      expect(verifySignature(body, header, vector.secret)).toBe(false);
    }
    expect(verifySignature(body, sign(body, vector.secret, 'not-a-number'), vector.secret)).toBe(false);
  });
  test('age policy is optional, rejects old/future requests when enabled', async () => {
    const body = Buffer.from(vector.body);
    expect(verifySignature(body, vector.signature, vector.secret, 0)).toBe(true);
    expect(verifySignature(body, vector.signature, vector.secret, 300)).toBe(false);
    expect(verifySignature(body, sign(body, vector.secret, String(Math.floor(Date.now()/1000))), vector.secret, 300)).toBe(true);
    expect(verifySignature(body, sign(body, vector.secret, String(Math.floor(Date.now()/1000) + 1000)), vector.secret, 300)).toBe(false);
    process.env.DUB_WEBHOOK_TOLERANCE_SECONDS = 'bad';
    expect((await send(vector.body)).status).toBe(500);
  });
}
