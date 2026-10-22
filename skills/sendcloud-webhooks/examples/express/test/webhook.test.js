const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'secretkey';
process.env.SENDCLOUD_WEBHOOK_SECRET = SECRET;

const { app, verifySendcloudSignature } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function send(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/sendcloud').set('Content-Type', contentType);
  if (signature !== undefined) req.set('Sendcloud-Signature', signature);
  return req.send(body);
}

describe('Sendcloud signature', () => {
  it('matches the documented test vector', () => {
    const expected = '1eed4b3d41f4653ac64fd56f1bf1cbfd349e4482cbc11dff7134bd93e5da4b0a';
    expect(sign('{"key": "value"}')).toBe(expected);
    expect(verifySendcloudSignature(Buffer.from('{"key": "value"}'), expected, 'secretkey')).toBe(true);
  });
});

describe('POST /webhooks/sendcloud', () => {
  const events = [
    { action: 'parcel_status_changed', timestamp: 1, parcel: { id: 1, status: { id: 1, message: 'Ready to send' } } },
    { action: 'return_created', timestamp: 1, data: { id: 42, order_number: 'ORD1' } },
    { action: 'integration_connected', timestamp: 1, integration: { id: 1 } },
    { action: 'integration_updated', timestamp: 1, integration: { id: 1 } },
    { action: 'integration_deleted', timestamp: 1, integration: { id: 1 } },
  ];

  it.each(events)('accepts a valid $action webhook', async (event) => {
    const body = JSON.stringify(event);
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(events[0]);
    const res = await send(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, including unusual whitespace', async () => {
    const body = '{"action":  "parcel_status_changed",\n "timestamp": 1}';
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('accepts unknown actions', async () => {
    const body = JSON.stringify({ action: 'something_new' });
    expect((await send(body, sign(body))).status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(events[0]);
    expect((await send(body, 'a'.repeat(64))).status).toBe(400);
  });

  it('rejects a signature of the wrong length', async () => {
    const body = JSON.stringify(events[0]);
    expect((await send(body, 'abc')).status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    const body = JSON.stringify(events[0]);
    expect((await send(body, sign(body, 'other'))).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(events[0]);
    const sig = sign(body);
    expect((await send(body.replace('1', '2'), sig)).status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const body = JSON.stringify(events[0]);
    expect((await send(body)).status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const body = 'not json';
    expect((await send(body, sign(body), 'text/plain')).status).toBe(400);
  });
});
