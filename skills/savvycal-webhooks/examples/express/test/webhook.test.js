const request = require('supertest');
const crypto = require('crypto');

// SavvyCal secrets are opaque strings; any value works for tests
const SECRET = 'test_savvycal_webhook_secret';
process.env.SAVVYCAL_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifySavvyCalSignature } = require('../src/index');

// Real SavvyCal algorithm: HMAC-SHA256 over the raw body, hex encoded
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = JSON.stringify({ type: 'event.created', id: 'payload_TEST123' });

describe('verifySavvyCalSignature', () => {
  it('accepts a bare lowercase hex digest', () => {
    expect(verifySavvyCalSignature(payload, sign(payload), SECRET)).toBe(true);
  });

  it('accepts a bare uppercase hex digest (Elixir sample style)', () => {
    expect(verifySavvyCalSignature(payload, sign(payload).toUpperCase(), SECRET)).toBe(true);
  });

  it('accepts the sha256= prefix with uppercase hex (docs header example)', () => {
    expect(verifySavvyCalSignature(payload, `sha256=${sign(payload).toUpperCase()}`, SECRET)).toBe(true);
  });

  it('accepts a SHA256= prefix with lowercase hex', () => {
    expect(verifySavvyCalSignature(payload, `SHA256=${sign(payload)}`, SECRET)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySavvyCalSignature(payload, sign(payload, 'other'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifySavvyCalSignature(payload + ' ', sign(payload), SECRET)).toBe(false);
  });

  it('rejects malformed or wrong-length signatures without throwing', () => {
    expect(verifySavvyCalSignature(payload, 'abc123', SECRET)).toBe(false);
    expect(verifySavvyCalSignature(payload, 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifySavvyCalSignature(payload, '', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/savvycal', () => {
  const post = (body, headers = {}) =>
    request(app).post('/webhooks/savvycal').set(headers).send(body);

  it('returns 200 for a valid signature', async () => {
    const res = await post(payload, {
      'Content-Type': 'application/json',
      'x-savvycal-signature': `sha256=${sign(payload).toUpperCase()}`,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await post(payload, {
      'Content-Type': 'text/plain',
      'x-savvycal-signature': sign(payload),
    });
    expect(res.status).toBe(200);
  });

  it.each([
    'event.created',
    'event.rescheduled',
    'event.canceled',
    'event.changed',
    'event.checkout.completed',
    'event.checkout.pending',
  ])('handles %s', async (type) => {
    const body = JSON.stringify({ type, id: 'payload_TEST123' });
    const res = await post(body, {
      'Content-Type': 'application/json',
      'x-savvycal-signature': sign(body),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(payload, {
      'Content-Type': 'application/json',
      'x-savvycal-signature': sign(payload, 'wrong'),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(payload, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not valid JSON', async () => {
    const body = 'not json';
    const res = await post(body, {
      'Content-Type': 'text/plain',
      'x-savvycal-signature': sign(body),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
