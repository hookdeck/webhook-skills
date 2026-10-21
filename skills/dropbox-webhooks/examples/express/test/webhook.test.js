const crypto = require('crypto');
const request = require('supertest');

const APP_SECRET = 'test_app_secret_abc123';
process.env.DROPBOX_APP_SECRET = APP_SECRET;

const app = require('../src/index');

// Dropbox signature: hex HMAC-SHA256 of the raw body keyed with the app secret
function sign(body, secret = APP_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = JSON.stringify({
  list_folder: { accounts: ['dbid:AAH4f99T0taONIb-OurWxbNQ6ywGRopQngc'] },
  delta: { users: [12345678] },
});

describe('GET /webhooks/dropbox (challenge)', () => {
  it('echoes the challenge as text/plain with nosniff', async () => {
    const res = await request(app).get('/webhooks/dropbox?challenge=abc123');
    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects a request without a challenge', async () => {
    const res = await request(app).get('/webhooks/dropbox');
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/dropbox', () => {
  it('accepts a valid signature', async () => {
    const res = await request(app)
      .post('/webhooks/dropbox')
      .set('Content-Type', 'application/json')
      .set('X-Dropbox-Signature', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/dropbox')
      .set('Content-Type', 'application/json')
      .set('X-Dropbox-Signature', sign(payload, 'wrong_secret'))
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/dropbox')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await request(app)
      .post('/webhooks/dropbox')
      .set('Content-Type', 'application/json')
      .set('X-Dropbox-Signature', 'abc')
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const res = await request(app)
      .post('/webhooks/dropbox')
      .set('Content-Type', 'application/json')
      .set('X-Dropbox-Signature', sign(payload))
      .send(payload.replace('dbid:AAH4', 'dbid:BBH4'));
    expect(res.status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const bad = 'not json';
    const res = await request(app)
      .post('/webhooks/dropbox')
      .set('Content-Type', 'application/json')
      .set('X-Dropbox-Signature', sign(bad))
      .send(bad);
    expect(res.status).toBe(400);
  });
});
