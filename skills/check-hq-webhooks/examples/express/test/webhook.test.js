const request = require('supertest');
const crypto = require('crypto');

// Check keys are 40 hex characters but are used as plain UTF-8 text
process.env.CHECK_WEBHOOK_KEY = '4f541ff5350323b6ba6ca4e96873e6f4cb9fd144';

const { app, verifyCheckWebhook } = require('../src/index');

const key = process.env.CHECK_WEBHOOK_KEY;

// Same algorithm as Check: hex HMAC-SHA256 of the raw body, key as UTF-8 text
function sign(payload, secret = key) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function post(body, { topic = 'payroll', signature, contentType = 'application/json' } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const req = request(app)
    .post('/webhooks/check-hq')
    .set('Content-Type', contentType)
    .set('Check-Topic', topic)
    .set('Check-WebhookEvent-ID', 'whe_test123')
    .set('Check-Live', 'false');
  if (signature !== null) req.set('Check-Signature', signature ?? sign(raw));
  return req.send(raw);
}

describe('verifyCheckWebhook', () => {
  const body = Buffer.from('{"event":"updated","data":{}}');

  it('accepts a valid signature', () => {
    expect(verifyCheckWebhook(body, sign(body), key)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyCheckWebhook(body, sign(body).toUpperCase(), key)).toBe(true);
  });

  it('rejects a signature made with the hex-decoded key', () => {
    const wrong = crypto.createHmac('sha256', Buffer.from(key, 'hex')).update(body).digest('hex');
    expect(verifyCheckWebhook(body, wrong, key)).toBe(false);
  });

  it('rejects a base64 signature', () => {
    const b64 = crypto.createHmac('sha256', key).update(body).digest('base64');
    expect(verifyCheckWebhook(body, b64, key)).toBe(false);
  });

  it('rejects a wrong or missing signature', () => {
    expect(verifyCheckWebhook(body, 'deadbeef', key)).toBe(false);
    expect(verifyCheckWebhook(body, undefined, key)).toBe(false);
  });
});

describe('POST /webhooks/check-hq', () => {
  it('returns 400 for a missing signature', async () => {
    const res = await post({ event: 'updated', data: { id: 'pay_1' } }, { signature: null });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post({ event: 'updated', data: { id: 'pay_1' } }, { signature: 'a'.repeat(64) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is modified after signing', async () => {
    const signature = sign(JSON.stringify({ event: 'updated', data: { id: 'pay_1' } }));
    const res = await post({ event: 'updated', data: { id: 'pay_2' } }, { signature });
    expect(res.status).toBe(400);
  });

  it('handles payroll updated', async () => {
    const res = await post({ event: 'updated', data: { id: 'pay_Z26PNMC7Ky1wfFQzVqfF', status: 'paid' } });
    expect(res.status).toBe(200);
  });

  it('handles payment status_change', async () => {
    const res = await post(
      { event: 'status_change', data: { id: 'pyt_vIFHhvyGN47ej1upyIT8', status: 'paid' } },
      { topic: 'payment' }
    );
    expect(res.status).toBe(200);
  });

  it('handles employee created', async () => {
    const res = await post(
      { event: 'created', data: { id: 'emp_zGGp6wYcxAeu1Ng8IA7v' } },
      { topic: 'employee' }
    );
    expect(res.status).toBe(200);
  });

  it('verifies any content type (text/plain)', async () => {
    const res = await post({ event: 'created', data: { id: 'emp_1' } }, { topic: 'employee', contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('handles the flat ping body', async () => {
    const res = await post({ message: 'Test webhook' }, { topic: 'ping' });
    expect(res.status).toBe(200);
  });

  it('returns 200 for unhandled events', async () => {
    const res = await post({ event: 'created', data: { id: 'doc_1' } }, { topic: 'employee_tax_document' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON');
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
