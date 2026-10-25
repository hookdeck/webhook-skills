const request = require('supertest');
const crypto = require('crypto');

// Semble's webhook secret is an opaque string used as-is; this one is only for tests
const SECRET = 'test_semble_secret_4d1e9b';
process.env.SEMBLE_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function hmac(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function sign(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  return `t=${timestamp},v1=${hmac(body, timestamp, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/semble').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Webhook-Signature', signature);
  return req.send(body);
}

const event = (eventType, identifiers = {}) =>
  JSON.stringify({
    subscriptionId: '692597070fe21cfa5e6a010f',
    eventId: '692597070fe21cfa5e6a010a',
    eventType,
    identifiers,
  });

const bookingCreated = event('booking.created', {
  bookingId: '507f1f77bcf86cd799439011',
  patientId: '507f191e810c19729de860ea',
  doctorId: '507f1f77bcf86cd799439012',
});

describe('Semble webhook signature verification', () => {
  it('accepts a valid X-Webhook-Signature', async () => {
    const res = await post(bookingCreated, sign(bookingCreated));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(bookingCreated, sign(bookingCreated), 'text/plain')).status).toBe(200);
  });

  it('allows a space after the comma in the header', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts}, v1=${hmac(bookingCreated, ts)}`;
    expect((await post(bookingCreated, header)).status).toBe(200);
  });

  it('accepts when any of several v1 values matches (defensive parsing)', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const stale = hmac(bookingCreated, ts, 'old_secret');
    const header = `t=${ts},v1=${stale},v1=${hmac(bookingCreated, ts)}`;
    expect((await post(bookingCreated, header)).status).toBe(200);
  });

  it('accepts an uppercase hex v1', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${hmac(bookingCreated, ts).toUpperCase()}`;
    expect((await post(bookingCreated, header)).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(bookingCreated, undefined)).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post(bookingCreated.replace('created', 'deleted'), sign(bookingCreated));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(bookingCreated, sign(bookingCreated, undefined, 'other_secret'))).status).toBe(400);
  });

  it('rejects when every v1 is wrong', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${hmac(bookingCreated, ts, 'a')},v1=${hmac(bookingCreated, ts, 'b')}`;
    expect((await post(bookingCreated, header)).status).toBe(400);
  });

  it('rejects a v1 of the wrong length or non-hex without throwing', async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect((await post(bookingCreated, `t=${ts},v1=abc`)).status).toBe(400);
    expect((await post(bookingCreated, `t=${ts},v1=${'z'.repeat(64)}`)).status).toBe(400);
    expect((await post(bookingCreated, `t=${ts},v1=${'é'.repeat(64)}`)).status).toBe(400);
  });

  it('rejects a header with no t or no v1', async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect((await post(bookingCreated, `v1=${hmac(bookingCreated, ts)}`)).status).toBe(400);
    expect((await post(bookingCreated, `t=${ts}`)).status).toBe(400);
    expect((await post(bookingCreated, 'garbage')).status).toBe(400);
    expect((await post(bookingCreated, 't=abc,v1=deadbeef')).status).toBe(400);
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(bookingCreated, 1700000000).replace('t=1700000000', 't=1700000001');
    expect((await post(bookingCreated, header)).status).toBe(400);
  });

  it('signs with t from X-Webhook-Signature, not X-Webhook-Timestamp', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(bookingCreated, sign(bookingCreated, ts)).set('X-Webhook-Timestamp', String(ts + 99));
    expect(res.status).toBe(200);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(bookingCreated, sign(bookingCreated, old))).status).toBe(200);
  });

  it('rejects an old timestamp when SEMBLE_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.SEMBLE_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(bookingCreated, sign(bookingCreated, old))).status).toBe(400);
      expect((await post(bookingCreated, sign(bookingCreated))).status).toBe(200);
    } finally {
      delete process.env.SEMBLE_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric SEMBLE_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.SEMBLE_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(bookingCreated, sign(bookingCreated, old))).status).toBe(200);
    } finally {
      delete process.env.SEMBLE_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });
});

describe('Semble events (dispatch on eventType)', () => {
  it.each([
    ['booking.created', { bookingId: 'b1' }],
    ['booking.updated', { bookingId: 'b1' }],
    ['booking.deleted', { bookingId: 'b1' }],
    ['contact.created', { contactId: 'c1' }],
    ['invoice.paid', { invoiceId: 'i1', paymentId: 'p1' }],
    ['resourceAvailability.updated', { resourceAvailabilityId: 'ra1' }],
    ['patient.created', { patientId: 'p1' }],
  ])('handles %s', async (eventType, identifiers) => {
    const body = event(eventType, identifiers);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      const logged = log.mock.calls.map((c) => c[0]).join('\n');
      if (eventType === 'patient.created') expect(logged).toContain('Unhandled event: patient.created');
      else expect(logged).not.toContain('Unhandled');
    } finally {
      log.mockRestore();
    }
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
