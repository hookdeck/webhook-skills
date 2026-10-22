const crypto = require('crypto');
const request = require('supertest');

// Go1 secret_key: max 64 chars, used as a raw UTF-8 string (special characters are part of the key)
const SECRET = 'MyS3cretK#y';
process.env.GO1_WEBHOOK_SECRET = SECRET;

const { app, verifyGo1Webhook } = require('../src/index');

// Go1 `t` is Unix MILLISECONDS
function sign(body, secret = SECRET, t = Date.now()) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const event = (type) => ({ id: 'ABnJ5giCDEFG', event_type: type });

const post = (body, header, contentType = 'application/json') => {
  const r = request(app).post('/webhooks/go1').set('Content-Type', contentType);
  if (header) r.set('Go1-Signature', header);
  return r.send(body);
};

describe('verifyGo1Webhook', () => {
  const body = JSON.stringify(event('enrollment.create'));

  test('accepts a valid signature', () => {
    expect(verifyGo1Webhook(body, sign(body), SECRET)).toBe(true);
  });

  test('accepts a Buffer body', () => {
    expect(verifyGo1Webhook(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  test('uses t verbatim (milliseconds); a seconds-converted t does not match', () => {
    const t = 1706747802205;
    const header = sign(body, SECRET, t);
    expect(verifyGo1Webhook(body, header, SECRET)).toBe(true);
    expect(verifyGo1Webhook(body, header.replace(`t=${t}`, `t=${Math.floor(t / 1000)}`), SECRET)).toBe(false);
  });

  test('rejects wrong secret', () => {
    expect(verifyGo1Webhook(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  test('rejects tampered body', () => {
    expect(verifyGo1Webhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  test('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Date.now() - 86400 * 1000;
    expect(verifyGo1Webhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  test('rejects an old timestamp with an explicit tolerance (milliseconds t, seconds tolerance)', () => {
    const old = Date.now() - 600 * 1000;
    expect(verifyGo1Webhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  test('accepts a fresh timestamp with a tolerance', () => {
    expect(verifyGo1Webhook(body, sign(body), SECRET, 300)).toBe(true);
  });

  test('rejects an old timestamp when GO1_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Date.now() - 600 * 1000;
      expect(verifyGo1Webhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric GO1_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Date.now() - 600 * 1000;
      expect(verifyGo1Webhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('rejects malformed headers', () => {
    expect(verifyGo1Webhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyGo1Webhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyGo1Webhook(body, `t=${Date.now()}`, SECRET)).toBe(false);
    expect(verifyGo1Webhook(body, undefined, SECRET)).toBe(false);
  });

  test('accepts when any v1 signature matches', () => {
    expect(verifyGo1Webhook(body, `${sign(body)},v1=deadbeef`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/go1', () => {
  test.each(['enrollment.create', 'enrollment.update', 'enrollment.delete', 'something.new'])(
    'returns 200 for a valid %s event',
    async (type) => {
      const body = JSON.stringify(event(type));
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    }
  );

  test('verifies regardless of content type', async () => {
    const body = JSON.stringify(event('enrollment.create'));
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(event('enrollment.create'));
    const res = await post(body, sign(body, 'wrong'));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a missing header', async () => {
    const res = await post(JSON.stringify(event('enrollment.create')));
    expect(res.status).toBe(400);
  });

  test('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
