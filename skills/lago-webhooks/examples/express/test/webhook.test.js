const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.LAGO_HMAC_KEY = 'test_hmac_signature_token';

const { app, verifyLagoSignature } = require('../src/index');

const secret = process.env.LAGO_HMAC_KEY;

/** Lago HMAC signature: base64 HMAC-SHA256 of the raw body. */
function generateLagoSignature(payload, key = secret) {
  return crypto.createHmac('sha256', key).update(payload).digest('base64');
}

function post(payload, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/lago')
    .set('Content-Type', contentType)
    .set('X-Lago-Signature-Algorithm', 'hmac')
    .set(headers)
    .send(payload);
}

describe('verifyLagoSignature', () => {
  const payload = '{"webhook_type":"invoice.created"}';

  it('accepts a valid signature', () => {
    expect(verifyLagoSignature(payload, generateLagoSignature(payload), secret)).toBe(true);
  });

  it('accepts a Buffer body', () => {
    expect(verifyLagoSignature(Buffer.from(payload), generateLagoSignature(payload), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyLagoSignature(payload, 'invalid', secret)).toBe(false);
  });

  it('rejects a missing signature or secret', () => {
    expect(verifyLagoSignature(payload, undefined, secret)).toBe(false);
    expect(verifyLagoSignature(payload, generateLagoSignature(payload), undefined)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const signature = generateLagoSignature(payload);
    expect(verifyLagoSignature('{"webhook_type":"invoice.voided"}', signature, secret)).toBe(false);
  });

  it('rejects a signature made with the wrong key', () => {
    expect(verifyLagoSignature(payload, generateLagoSignature(payload, 'other'), secret)).toBe(false);
  });
});

describe('POST /webhooks/lago', () => {
  it('returns 400 for a missing signature header', async () => {
    const res = await post('{}');
    expect(res.status).toBe(400);
    expect(res.text).toContain('Missing X-Lago-Signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post('{}', { 'X-Lago-Signature': 'invalid' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid signature');
  });

  it('returns 400 when the endpoint uses the jwt algorithm', async () => {
    const payload = JSON.stringify({ webhook_type: 'invoice.created' });
    const res = await post(payload, {
      'X-Lago-Signature': generateLagoSignature(payload),
      'X-Lago-Signature-Algorithm': 'jwt',
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('hmac');
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ webhook_type: 'invoice.created', amount: 100 });
    const tampered = JSON.stringify({ webhook_type: 'invoice.created', amount: 999 });
    const res = await post(tampered, { 'X-Lago-Signature': generateLagoSignature(original) });
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      webhook_type: 'invoice.created',
      object_type: 'invoice',
      organization_id: 'org_1',
      invoice: { lago_id: 'inv_1' },
    });
    const res = await post(payload, {
      'X-Lago-Signature': generateLagoSignature(payload),
      'X-Lago-Unique-Key': 'key-1',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const payload = JSON.stringify({ webhook_type: 'customer.created', object_type: 'customer', customer: {} });
    const res = await post(payload, { 'X-Lago-Signature': generateLagoSignature(payload) }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('handles every documented event type', async () => {
    const events = [
      'invoice.created',
      'invoice.payment_status_updated',
      'subscription.started',
      'subscription.terminated',
      'customer.created',
      'wallet.depleted_ongoing_balance',
      'unknown.event.type',
    ];

    for (const webhook_type of events) {
      const payload = JSON.stringify({ webhook_type, object_type: 'thing', organization_id: 'org_1', thing: {} });
      const res = await post(payload, { 'X-Lago-Signature': generateLagoSignature(payload) });
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
