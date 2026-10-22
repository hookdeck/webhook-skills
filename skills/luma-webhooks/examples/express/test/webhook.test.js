const crypto = require('crypto');
const request = require('supertest');

// Luma secrets start with whsec_ and are used whole as a UTF-8 key (NOT base64-decoded)
const SECRET = 'whsec_test_secret_123';
process.env.LUMA_WEBHOOK_SECRET = SECRET;

const { app, verifyLumaWebhook } = require('../src/index');

function sign(body, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const event = (type, data = {}) => ({ type, data });

const post = (body, header, contentType = 'application/json') => {
  const r = request(app).post('/webhooks/luma').set('Content-Type', contentType);
  if (header) r.set('Webhook-Signature', header);
  return r.send(body);
};

describe('verifyLumaWebhook', () => {
  const body = JSON.stringify(event('guest.registered'));

  test('accepts a valid signature', () => {
    expect(verifyLumaWebhook(body, sign(body), SECRET)).toBe(true);
  });

  test('uses the whole whsec_ secret, not a stripped or base64-decoded one', () => {
    const stripped = SECRET.slice('whsec_'.length);
    expect(verifyLumaWebhook(body, sign(body, stripped), SECRET)).toBe(false);
    const decoded = Buffer.from(stripped, 'base64');
    const t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac('sha256', decoded).update(`${t}.${body}`).digest('hex');
    expect(verifyLumaWebhook(body, `t=${t},v1=${v1}`, SECRET)).toBe(false);
  });

  test('rejects wrong secret', () => {
    expect(verifyLumaWebhook(body, sign(body, 'whsec_other'), SECRET)).toBe(false);
  });

  test('rejects tampered body', () => {
    expect(verifyLumaWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  test('accepts a Buffer body', () => {
    expect(verifyLumaWebhook(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  test('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  test('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  test('rejects an old timestamp when LUMA_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric LUMA_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('stale timestamp passes with a wider tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET, 3600)).toBe(true);
  });

  test('rejects malformed headers', () => {
    expect(verifyLumaWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyLumaWebhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyLumaWebhook(body, `t=${Math.floor(Date.now() / 1000)}`, SECRET)).toBe(false);
    expect(verifyLumaWebhook(body, undefined, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/luma', () => {
  const types = [
    'calendar.event.added',
    'calendar.event.submitted',
    'calendar.person.subscribed',
    'calendar.person.unsubscribed',
    'event.created',
    'event.updated',
    'event.canceled',
    'guest.registered',
    'guest.updated',
    'guest.refunded',
    'ticket.registered',
    'something.new',
  ];

  test.each(types)('returns 200 for a valid %s event', async (type) => {
    const body = JSON.stringify(event(type, { id: 'x', user_email: 'a@example.com', email: 'a@example.com' }));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('verifies regardless of content type', async () => {
    const body = JSON.stringify(event('guest.registered'));
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(event('guest.registered'));
    const res = await post(body, sign(body, 'whsec_wrong'));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a missing header', async () => {
    const res = await post(JSON.stringify(event('guest.registered')));
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
