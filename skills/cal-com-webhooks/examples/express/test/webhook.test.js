const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app.
// Cal.com secrets are free-form strings chosen by the user.
const secret = 'test_calcom_webhook_secret';
process.env.CALCOM_WEBHOOK_SECRET = secret;

const { app, verifyCalComWebhook } = require('../src/index');

/** Generate a Cal.com signature: hex(HMAC-SHA256(secret, rawBody)), no prefix. */
function sign(payload, key = secret) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function bookingEvent(triggerEvent, extra = {}) {
  return JSON.stringify({
    triggerEvent,
    createdAt: '2024-01-01T00:00:00.000Z',
    payload: {
      uid: 'unique-booking-id',
      bookingId: 100,
      title: 'Strategy Session between Organizer and Guest',
      startTime: '2024-01-01T10:00:00Z',
      endTime: '2024-01-01T10:15:00Z',
      organizer: { name: 'Organizer Name', email: 'organizer@example.com' },
      attendees: [{ name: 'Guest User', email: 'guest@example.com' }],
      ...extra,
    },
  });
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app)
    .post('/webhooks/cal-com')
    .set('Content-Type', contentType)
    .set('X-Cal-Webhook-Version', '2021-10-20');
  if (signature !== undefined) req.set('X-Cal-Signature-256', signature);
  return req.send(body);
}

describe('verifyCalComWebhook', () => {
  const body = bookingEvent('BOOKING_CREATED');

  it('accepts a valid signature', () => {
    expect(verifyCalComWebhook(Buffer.from(body), sign(body), secret)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyCalComWebhook(Buffer.from(body), sign(body, 'wrong'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const tampered = body.replace('Guest User', 'Mallory');
    expect(verifyCalComWebhook(Buffer.from(tampered), sign(body), secret)).toBe(false);
  });

  it('rejects a sha256= prefixed value', () => {
    expect(verifyCalComWebhook(Buffer.from(body), `sha256=${sign(body)}`, secret)).toBe(false);
  });

  it('rejects "no-secret-provided" and missing values', () => {
    expect(verifyCalComWebhook(Buffer.from(body), 'no-secret-provided', secret)).toBe(false);
    expect(verifyCalComWebhook(Buffer.from(body), undefined, secret)).toBe(false);
    expect(verifyCalComWebhook(Buffer.from(body), sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/cal-com', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await post(bookingEvent('BOOKING_CREATED'));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(bookingEvent('BOOKING_CREATED'), 'a'.repeat(64));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for an unsigned webhook (no-secret-provided)', async () => {
    const res = await post(bookingEvent('BOOKING_CREATED'), 'no-secret-provided');
    expect(res.status).toBe(400);
  });

  it.each([
    ['BOOKING_CREATED', {}],
    ['BOOKING_RESCHEDULED', { rescheduleUid: 'previous-booking-id' }],
    ['BOOKING_CANCELLED', { cancellationReason: 'Conflict' }],
    ['BOOKING_PAID', { paymentId: 500 }],
    ['SOME_FUTURE_EVENT', {}],
  ])('returns 200 for a signed %s event', async (trigger, extra) => {
    const body = bookingEvent(trigger, extra);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('handles the flat MEETING_ENDED payload', async () => {
    const body = JSON.stringify({
      triggerEvent: 'MEETING_ENDED',
      id: 100,
      uid: 'unique-booking-identifier',
      title: 'Strategy Session',
    });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('verifies non-JSON custom template bodies before rejecting them', async () => {
    const body = 'type=intro-call&name=Guest';
    const bad = await post(body, 'a'.repeat(64), 'application/x-www-form-urlencoded');
    expect(bad.text).toBe('Invalid signature');
    const good = await post(body, sign(body), 'application/x-www-form-urlencoded');
    expect(good.status).toBe(400);
    expect(good.text).toBe('Invalid JSON');
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.CALCOM_WEBHOOK_SECRET;
    try {
      const body = bookingEvent('BOOKING_CREATED');
      const res = await post(body, sign(body));
      expect(res.status).toBe(500);
    } finally {
      process.env.CALCOM_WEBHOOK_SECRET = secret;
    }
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
