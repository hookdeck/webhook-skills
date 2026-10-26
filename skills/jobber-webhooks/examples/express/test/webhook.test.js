const request = require('supertest');
const crypto = require('crypto');

const CLIENT_SECRET = 'test_jobber_client_secret';
process.env.JOBBER_CLIENT_SECRET = CLIENT_SECRET;

const { app, verifyJobberSignature } = require('../src/index');

// Jobber signs the raw body: base64(HMAC-SHA256(rawBody, clientSecret))
function sign(payload, secret = CLIENT_SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

function samplePayload(topic = 'CLIENT_CREATE') {
  return JSON.stringify({
    data: {
      webHookEvent: {
        topic,
        appId: '3ef22a50-072d-430c-a78f-b7646657560b',
        accountId: 'MQ==',
        itemId: 'MQ==',
        occurredAt: '2026-07-16T16:31:31-06:00',
      },
    },
  });
}

describe('verifyJobberSignature', () => {
  const body = Buffer.from(samplePayload());

  it('accepts a valid signature', () => {
    expect(verifyJobberSignature(body, sign(body), CLIENT_SECRET)).toBe(true);
  });

  it('rejects a signature from another secret', () => {
    expect(verifyJobberSignature(body, sign(body, 'other'), CLIENT_SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyJobberSignature(body, undefined, CLIENT_SECRET)).toBe(false);
  });

  it('rejects a header of the wrong length without throwing', () => {
    expect(verifyJobberSignature(body, 'short', CLIENT_SECRET)).toBe(false);
  });

  it('rejects a valid signature with trailing junk', () => {
    expect(verifyJobberSignature(body, sign(body) + 'xx', CLIENT_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/jobber', () => {
  it('returns 200 for a valid CLIENT_CREATE webhook', async () => {
    const payload = samplePayload('CLIENT_CREATE');
    const res = await request(app)
      .post('/webhooks/jobber')
      .set('Content-Type', 'application/json')
      .set('X-Jobber-Hmac-SHA256', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it.each(['INVOICE_UPDATE', 'APP_CONNECT', 'APP_DISCONNECT', 'SOMETHING_ELSE'])(
    'returns 200 for %s',
    async (topic) => {
      const payload = samplePayload(topic);
      const res = await request(app)
        .post('/webhooks/jobber')
        .set('Content-Type', 'application/json')
        .set('X-Jobber-Hmac-SHA256', sign(payload))
        .send(payload);
      expect(res.status).toBe(200);
    }
  );

  it('verifies regardless of content type', async () => {
    const payload = samplePayload();
    const res = await request(app)
      .post('/webhooks/jobber')
      .set('Content-Type', 'text/plain')
      .set('X-Jobber-Hmac-SHA256', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/jobber')
      .set('Content-Type', 'application/json')
      .set('X-Jobber-Hmac-SHA256', sign('different body'))
      .send(samplePayload());
    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/jobber')
      .set('Content-Type', 'application/json')
      .send(samplePayload());
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const payload = 'not json';
    const res = await request(app)
      .post('/webhooks/jobber')
      .set('Content-Type', 'text/plain')
      .set('X-Jobber-Hmac-SHA256', sign(payload))
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('returns 400 when webHookEvent is missing', async () => {
    const payload = JSON.stringify({ data: {} });
    const res = await request(app)
      .post('/webhooks/jobber')
      .set('Content-Type', 'application/json')
      .set('X-Jobber-Hmac-SHA256', sign(payload))
      .send(payload);
    expect(res.status).toBe(400);
  });
});
