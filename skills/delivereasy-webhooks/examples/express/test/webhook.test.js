const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_api_key_for_delivereasy';
process.env.DELIVEREASY_WEBHOOK_SECRET = SECRET;

const { app, verifyDelivereasy } = require('../src/index');

// Same algorithm as Delivereasy: Base64.strict_encode64(HMAC-SHA256(api_key, body))
const sign = (body, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('base64');

const body = JSON.stringify({
  id: 12345,
  booking_identifier: 'ABC123',
  status: 'example_status',
  driver: { name: 'Sam' },
  pickup: {},
  dropoff: {},
});

describe('Delivereasy webhook', () => {
  it('accepts a valid signature', async () => {
    const res = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts any content type when the bytes are signed', async () => {
    const res = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'application/vnd.api+json')
      .set('X-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('verifies exact bytes, not re-serialized JSON', async () => {
    const spaced = '{ "id": 1,  "status": "x" }';
    const res = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sign(spaced))
      .send(spaced);
    expect(res.status).toBe(200);
    const bad = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sign(JSON.stringify(JSON.parse(spaced))))
      .send(spaced);
    expect(bad.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    const res = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'application/json')
      .set('X-Signature', '')
      .send(body);
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong key', async () => {
    const res = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sign(body, 'other_key'))
      .send(body);
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sign(body))
      .send(body.replace('ABC123', 'XYZ999'));
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature without throwing', async () => {
    for (const sig of ['not-base64', sign(body).slice(0, -1), `sha256=${sign(body)}`]) {
      const res = await request(app)
        .post('/webhooks/delivereasy')
        .set('Content-Type', 'application/json')
        .set('X-Signature', sig)
        .send(body);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a non-canonical base64 value that decodes to the same bytes', () => {
    const good = sign(body);
    // Final base64 char carries only 2 data bits (44 chars -> 32 bytes); change the unused low bits
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const last = good[42];
    const idx = alphabet.indexOf(last);
    const variant = alphabet[(idx & ~3) | (((idx & 3) + 1) % 4)];
    const forged = good.slice(0, 42) + variant + '=';
    expect(Buffer.from(forged, 'base64').equals(Buffer.from(good, 'base64'))).toBe(true);
    expect(verifyDelivereasy(Buffer.from(body), forged, SECRET)).toBe(false);
    expect(verifyDelivereasy(Buffer.from(body), good, SECRET)).toBe(true);
  });

  it('returns 400 for a signed but non-JSON body', async () => {
    const res = await request(app)
      .post('/webhooks/delivereasy')
      .set('Content-Type', 'text/plain')
      .set('X-Signature', sign('not json'))
      .send('not json');
    expect(res.status).toBe(400);
  });
});
