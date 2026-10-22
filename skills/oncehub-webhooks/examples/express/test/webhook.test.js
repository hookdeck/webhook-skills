const crypto = require('crypto');
const request = require('supertest');

// The endpoint secret (View secret in the dashboard) is used as a UTF-8 string
const SECRET = 'oncehub_test_secret_123';
process.env.ONCEHUB_WEBHOOK_SECRET = SECRET;

const { app, verifyOncehubWebhook } = require('../src/index');

function sign(body, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const s = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},s=${s}`;
}

const event = (type, data = { object: 'booking', id: 'BKNG-YNMGHKQ24XV5' }) => ({
  id: 'EVNT-2AB8RJY3LF',
  object: 'event',
  creation_time: '2021-01-20T12:10:03.140Z',
  type,
  api_version: 'v2',
  data,
});

const post = (body, header) => {
  const r = request(app).post('/webhooks/oncehub').set('Content-Type', 'application/json');
  if (header) r.set('Oncehub-Signature', header);
  return r.send(body);
};

describe('verifyOncehubWebhook', () => {
  const body = JSON.stringify(event('booking.scheduled'));

  test('accepts a valid signature', () => {
    expect(verifyOncehubWebhook(body, sign(body), SECRET)).toBe(true);
  });

  test('rejects wrong secret', () => {
    expect(verifyOncehubWebhook(body, sign(body, 'other_secret'), SECRET)).toBe(false);
  });

  test('rejects tampered body', () => {
    expect(verifyOncehubWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  test('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  test('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  test('rejects an old timestamp when ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('stale timestamp passes with a wider tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET, 3600)).toBe(true);
  });

  test('rejects malformed headers', () => {
    expect(verifyOncehubWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyOncehubWebhook(body, 't=abc,s=00', SECRET)).toBe(false);
    expect(verifyOncehubWebhook(body, `t=${Math.floor(Date.now() / 1000)}`, SECRET)).toBe(false);
    expect(verifyOncehubWebhook(body, undefined, SECRET)).toBe(false);
  });

  test('accepts when any s signature matches', () => {
    const header = `${sign(body)},s=deadbeef`;
    expect(verifyOncehubWebhook(body, header, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/oncehub', () => {
  test.each([
    'booking.scheduled',
    'booking.rescheduled',
    'booking.reassigned',
    'booking.canceled_then_rescheduled',
    'booking.canceled_reschedule_requested',
    'booking.canceled',
    'booking.completed',
    'booking.no_show',
    'conversation.started',
    'conversation.closed',
    'conversation.abandoned',
    'something.new',
  ])('returns 200 for a validly signed %s event', async (type) => {
    const body = JSON.stringify(event(type));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('verifies any content type (raw body)', async () => {
    const body = JSON.stringify(event('booking.scheduled'));
    const res = await request(app)
      .post('/webhooks/oncehub')
      .set('Content-Type', 'text/plain')
      .set('Oncehub-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(event('booking.scheduled'));
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a missing header', async () => {
    const res = await post(JSON.stringify(event('booking.scheduled')));
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
