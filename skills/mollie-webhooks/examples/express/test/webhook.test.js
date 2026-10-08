const crypto = require('crypto');
const request = require('supertest');
const { createApp, verifyMollieSignature } = require('../src/index');

// Mollie webhooks are unsigned: the POST body is form-urlencoded and carries only
// an `id`. These tests inject a fake `fetchPayment` so we never call the real API,
// and assert the handler dispatches on the AUTHORITATIVE status it returns.

function appWith(fetchPayment) {
  return createApp({ fetchPayment });
}

describe('POST /webhooks/mollie', () => {
  it('returns 400 when the id is missing', async () => {
    const app = appWith(async () => {
      throw new Error('should not be called');
    });
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({});
    expect(res.status).toBe(400);
  });

  it('fetches the payment by the id from the form body (not the request status)', async () => {
    let fetchedId;
    const app = appWith(async (id) => {
      fetchedId = id;
      return { id, status: 'paid', amount: { currency: 'EUR', value: '10.00' } };
    });

    // Even if an attacker sends status=paid in the body, we ignore it and fetch.
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({ id: 'tr_abc123', status: 'ignored' });

    expect(res.status).toBe(200);
    expect(fetchedId).toBe('tr_abc123');
  });

  it('returns 200 for an unknown/deleted id (fetch returns null)', async () => {
    const app = appWith(async () => null);
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({ id: 'tr_unknown' });
    expect(res.status).toBe(200);
  });

  it('returns 500 when the Mollie API fetch fails (so Mollie retries)', async () => {
    const app = appWith(async () => {
      throw new Error('network down');
    });
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({ id: 'tr_transient' });
    expect(res.status).toBe(500);
  });

  it.each([
    'open',
    'pending',
    'authorized',
    'paid',
    'canceled',
    'expired',
    'failed',
    'some_future_status',
  ])('returns 200 and handles status %s', async (status) => {
    const app = appWith(async (id) => ({
      id,
      status,
      amount: { currency: 'EUR', value: '10.00' },
    }));
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({ id: `tr_${status}` });
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });
});

describe('GET /health', () => {
  it('responds 200', async () => {
    const app = appWith(async () => null);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// --- Next-gen webhooks: signed JSON events on /webhooks/mollie/events ---

const SECRET = 'test_signing_secret';

// Mollie's documented next-gen event example (payment-link.paid, simple payload).
const EVENT = JSON.stringify({
  resource: 'event',
  id: 'event_GvJ8WHrp5isUdRub9CJyH',
  type: 'payment-link.paid',
  entityId: 'pl_qng5gbbv8NAZ5gpM5ZYgx',
  createdAt: '2024-12-16T15:59:04.0Z',
  _links: {
    self: {
      href: 'https://api.mollie.com/v2/events/event_GvJ8WHrp5isUdRub9CJyH',
      type: 'application/hal+json',
    },
  },
});

function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function postEvent(app, body, signature) {
  const req = request(app)
    .post('/webhooks/mollie/events')
    .set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('X-Mollie-Signature', signature);
  return req.send(body);
}

describe('verifyMollieSignature', () => {
  it('accepts a valid sha256= signature over the raw body', () => {
    expect(verifyMollieSignature(Buffer.from(EVENT), sign(EVENT), SECRET)).toBe(true);
  });

  it('rejects a signature without matching digest', () => {
    expect(verifyMollieSignature(Buffer.from(EVENT), sign(EVENT, 'other'), SECRET)).toBe(false);
  });

  it('accepts either of two comma-joined signatures (secret rotation)', () => {
    const header = `${sign(EVENT, 'old_secret')}, ${sign(EVENT)}`;
    expect(verifyMollieSignature(Buffer.from(EVENT), header, SECRET)).toBe(true);
  });

  it('rejects a missing header or secret', () => {
    expect(verifyMollieSignature(Buffer.from(EVENT), undefined, SECRET)).toBe(false);
    expect(verifyMollieSignature(Buffer.from(EVENT), sign(EVENT), '')).toBe(false);
  });
});

describe('POST /webhooks/mollie/events', () => {
  const app = appWith(async () => {
    throw new Error('next-gen events must not trigger a classic fetch');
  });
  let originalSecret;

  beforeEach(() => {
    originalSecret = process.env.MOLLIE_WEBHOOK_SECRET;
    process.env.MOLLIE_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.MOLLIE_WEBHOOK_SECRET;
    else process.env.MOLLIE_WEBHOOK_SECRET = originalSecret;
  });

  it('returns 200 for a correctly signed event', async () => {
    const res = await postEvent(app, EVENT, sign(EVENT));
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await postEvent(app, EVENT);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const res = await postEvent(app, EVENT, sign(EVENT, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body was modified after signing', async () => {
    const tampered = EVENT.replace('payment-link.paid', 'payment.paid');
    const res = await postEvent(app, tampered, sign(EVENT));
    expect(res.status).toBe(400);
  });

  it('accepts two signature headers during a secret rotation', async () => {
    const res = await request(app)
      .post('/webhooks/mollie/events')
      .set('Content-Type', 'application/json')
      .set('X-Mollie-Signature', [sign(EVENT, 'old_secret'), sign(EVENT)])
      .send(EVENT);
    expect(res.status).toBe(200);
  });

  it.each(['payment.paid', 'payment.failed', 'payout.completed', 'some.future_event'])(
    'returns 200 and handles event type %s',
    async (type) => {
      const body = JSON.stringify({ ...JSON.parse(EVENT), type, entityId: 'tr_abc123' });
      const res = await postEvent(app, body, sign(body));
      expect(res.status).toBe(200);
    }
  );

  it('returns 500 when MOLLIE_WEBHOOK_SECRET is not set (never fails open)', async () => {
    delete process.env.MOLLIE_WEBHOOK_SECRET;
    const res = await postEvent(app, EVENT, sign(EVENT));
    expect(res.status).toBe(500);
  });
});
