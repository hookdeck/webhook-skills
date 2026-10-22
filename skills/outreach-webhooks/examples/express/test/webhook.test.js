const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'outreach_test_secret_0123456789';
process.env.PORT = '0';
process.env.OUTREACH_WEBHOOK_SECRET = SECRET;

const { app, server, verifyOutreachSignature } = require('../src/index');

// Same algorithm as Outreach: bare hex HMAC-SHA256 of the raw body
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = JSON.stringify({
  data: { type: 'prospect', id: 42, attributes: { firstName: 'Ada' } },
  meta: { deliveredAt: '2025-10-21T22:54:57.000Z', eventName: 'prospect.created' },
});

describe('Outreach webhook (Express)', () => {
  afterAll((done) => {
    server.close(done);
  });

  it('accepts a valid signature', async () => {
    const res = await request(app)
      .post('/webhooks/outreach')
      .set('Content-Type', 'application/json')
      .set('Outreach-Webhook-Signature', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies any content type, e.g. application/vnd.api+json', async () => {
    const res = await request(app)
      .post('/webhooks/outreach')
      .set('Content-Type', 'application/vnd.api+json')
      .set('Outreach-Webhook-Signature', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('handles each documented event', async () => {
    for (const eventName of ['prospect.updated', 'sequenceState.created', 'call.created', 'task.completed', 'mailing.replied', 'account.destroyed']) {
      const body = JSON.stringify({ data: { type: 'x', id: 1 }, meta: { eventName } });
      const res = await request(app)
        .post('/webhooks/outreach')
        .set('Content-Type', 'application/json')
        .set('Outreach-Webhook-Signature', sign(body))
        .send(body);
      expect(res.status).toBe(200);
    }
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await request(app)
      .post('/webhooks/outreach')
      .set('Content-Type', 'application/json')
      .set('Outreach-Webhook-Signature', sign(payload, 'other'))
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await request(app)
      .post('/webhooks/outreach')
      .set('Content-Type', 'application/json')
      .set('Outreach-Webhook-Signature', sign(payload))
      .send(payload.replace('Ada', 'Eve'));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length without throwing', async () => {
    const res = await request(app)
      .post('/webhooks/outreach')
      .set('Content-Type', 'application/json')
      .set('Outreach-Webhook-Signature', 'abc123')
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/outreach')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a valid signature with invalid JSON', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/outreach')
      .set('Content-Type', 'application/json')
      .set('Outreach-Webhook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('verifyOutreachSignature is hex, case-insensitive and length-safe', () => {
    const sig = sign(payload);
    expect(verifyOutreachSignature(Buffer.from(payload), sig, SECRET)).toBe(true);
    expect(verifyOutreachSignature(Buffer.from(payload), sig.toUpperCase(), SECRET)).toBe(true);
    expect(verifyOutreachSignature(Buffer.from(payload), `sha256=${sig}`, SECRET)).toBe(false);
    expect(verifyOutreachSignature(Buffer.from(payload), undefined, SECRET)).toBe(false);
    expect(verifyOutreachSignature(Buffer.from(payload), sig, undefined)).toBe(false);
  });
});
