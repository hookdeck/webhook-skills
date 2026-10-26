const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'pLjUpNQu8a4YjeCrf2KseA';
process.env.DOJAH_WEBHOOK_SECRET = SECRET;

const { app, verifyDojahSignature } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(verificationStatus, status = true) {
  return JSON.stringify({
    reference_id: 'DJ-92F24FA662',
    verification_status: verificationStatus,
    status,
    data: { selfie: { status: true } },
  });
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/dojah').set('Content-Type', contentType);
  if (signature !== undefined) req.set('x-dojah-signature', signature);
  return req.send(body);
}

describe('Dojah webhook handler', () => {
  let logSpy;
  beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockClear());
  afterAll(() => jest.restoreAllMocks());

  test.each(['Ongoing', 'Pending', 'Completed', 'Failed', 'Abandoned'])(
    'accepts a validly signed %s event',
    async (verificationStatus) => {
      const body = payload(verificationStatus);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
  );

  test('treats Completed with status false as not passed', async () => {
    const body = payload('Completed', false);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Verification completed but not passed:', 'DJ-92F24FA662');
  });

  test('verifies regardless of Content-Type', async () => {
    const body = payload('Completed');
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('accepts an uppercase hex signature', async () => {
    const body = payload('Completed');
    const res = await post(body, sign(body).toUpperCase());
    expect(res.status).toBe(200);
  });

  test('acknowledges events from other services without verification_status', async () => {
    const body = JSON.stringify({ event: 'sms.delivered' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('ignores wrong-typed fields instead of failing', async () => {
    const body = JSON.stringify({ reference_id: { a: 1 }, verification_status: ['Completed'], status: 'yes', data: 5 });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header with 401', async () => {
    const res = await post(payload('Completed'));
    expect(res.status).toBe(401);
  });

  test('rejects an empty signature header with 401', async () => {
    const res = await post(payload('Completed'), '');
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with the wrong secret', async () => {
    const body = payload('Completed');
    const res = await post(body, sign(body, 'wrong-secret'));
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const res = await post(payload('Failed'), sign(payload('Completed')));
    expect(res.status).toBe(401);
  });

  test.each([
    ['too short', 'abc123'],
    ['non-hex of right length', 'z'.repeat(64)],
    ['valid hex prefix with junk suffix', sign('x').slice(0, 60) + 'zzzz'],
    ['prefixed', 'sha256=' + sign('x')],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    const res = await post(payload('Completed'), sig);
    expect(res.status).toBe(401);
  });

  test('rejects invalid JSON that is correctly signed', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  test.each(['[1,2]', '"text"', 'null', '7'])('rejects a signed non-object body (%s)', async (body) => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });
});

describe('verifyDojahSignature', () => {
  test('accepts a correct digest', () => {
    const body = Buffer.from('{"a":1}');
    expect(verifyDojahSignature(body, sign(body), SECRET)).toBe(true);
  });

  test('signs bytes exactly as received', () => {
    const body = Buffer.from('{ "b": 1,  "a": 2 }');
    expect(verifyDojahSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyDojahSignature(Buffer.from('{"b":1,"a":2}'), sign(body), SECRET)).toBe(false);
  });

  test('rejects when no secret is configured', () => {
    const body = Buffer.from('{"a":1}');
    expect(verifyDojahSignature(body, sign(body), undefined)).toBe(false);
  });
});
