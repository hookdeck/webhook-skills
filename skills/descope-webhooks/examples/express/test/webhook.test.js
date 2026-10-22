const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_descope_hmac_secret';
process.env.DESCOPE_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

// Descope: base64 HMAC-SHA256 of the JSON string it sends
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

const events = [
  { action: 'LoginSucceed', actorId: 'U1', userId: 'U1', projectId: 'P1', loginIds: ['a@b.com'], occurred: 1780949905843, data: {} },
  { action: 'UserModified', actorId: 'U1', userId: 'U2', projectId: 'P1', loginIds: ['c@d.com'], occurred: 1780949905900, data: {} },
  { action: 'Change Password', actorId: 'U1', userId: 'U1', projectId: 'P1', occurred: 1780949905999, data: {} },
];
const body = JSON.stringify(events);

describe('Descope webhook', () => {
  it('accepts a valid signature on a batch', async () => {
    const res = await request(app)
      .post('/webhooks/descope')
      .set('Content-Type', 'application/json')
      .set('x-descope-webhook-s256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 3 });
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/descope')
      .set('Content-Type', 'text/plain')
      .set('x-descope-webhook-s256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await request(app)
      .post('/webhooks/descope')
      .set('Content-Type', 'application/json')
      .set('x-descope-webhook-s256', sign(body, 'other'))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await request(app)
      .post('/webhooks/descope')
      .set('Content-Type', 'application/json')
      .set('x-descope-webhook-s256', sign(body))
      .send(body.replace('LoginSucceed', 'LoginFailed'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/descope')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature', async () => {
    const res = await request(app)
      .post('/webhooks/descope')
      .set('Content-Type', 'application/json')
      .set('x-descope-webhook-s256', 'not-a-signature')
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON even when correctly signed', async () => {
    const bad = '{not json';
    const res = await request(app)
      .post('/webhooks/descope')
      .set('Content-Type', 'application/json')
      .set('x-descope-webhook-s256', sign(bad))
      .send(bad);
    expect(res.status).toBe(400);
  });
});
