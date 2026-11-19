// Generated with: klarna-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret
const SECRET = 'klarna_synthetic_signing_key_8a4f2c';
process.env.KLARNA_SIGNING_KEY = SECRET;

const { app, verifyKlarnaSignature } = require('../src/index');

const BODY = '{"metadata":{"event_id":"b0e715e0-2ebd-462f-80f6-1366b4f90001","event_type":"payment.request.state-change.completed","event_version":"v2","occurred_at":"2026-11-18T10:15:00.000Z","product_instance_id":"krn:partner:product:test:5cadd30a-0000-4000-8000-000000000001","webhook_id":"krn:partner:global:notification:webhook:bc266feb-0000-4000-8000-000000000001","live":false},"payload":{"payment_request_id":"krn:payment:eu1:request:552603c0-0000-4000-8000-000000000001"}}';
const BODY2 = '{"metadata":{"event_id":"b0e715e0-2ebd-462f-80f6-1366b4f90002","event_type":"payment.request.state-change.expired","event_version":"v2","occurred_at":"2026-11-18T10:20:00.000Z","webhook_id":"krn:partner:global:notification:webhook:bc266feb-0000-4000-8000-000000000001","live":false},"payload":{"payment_request_id":"krn:payment:eu1:request:552603c0-0000-4000-8000-000000000002"}}';

const sign = (body, key = SECRET) => '' + crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body, signature, headers = {}) => {
  const req = request(app).post('/webhooks/klarna').set('Content-Type', 'application/json').set(headers);
  if (signature !== undefined) req.set('Klarna-Signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.KLARNA_SIGNING_KEY = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyKlarnaSignature', () => {
  it('accepts a signature over the raw body', () => {
    expect(verifyKlarnaSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a base64 digest: Klarna sends hex', () => {
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyKlarnaSignature(BODY, other, SECRET)).toBe(false);
  });

});

describe('/webhooks/klarna', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: 'payment.request.state-change.completed', event_id: 'b0e715e0-2ebd-462f-80f6-1366b4f90001' });
  });

  it('handles a second event type', async () => {
    const res = await post(BODY2, sign(BODY2));
    expect(res.status).toBe(200);
    expect(res.body.event_type).toBe('payment.request.state-change.expired');
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('state-change.completed', 'state-change.declined'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.KLARNA_SIGNING_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when KLARNA_SIGNING_KEY is not set', async () => {
    delete process.env.KLARNA_SIGNING_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
