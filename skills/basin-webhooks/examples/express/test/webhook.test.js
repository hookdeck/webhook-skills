const crypto = require('crypto');
const request = require('supertest');

process.env.BASIN_WEBHOOK_SECRET = 'basin_test_signing_secret';
const { app, verifyBasinSignature } = require('../src/index');

const SECRET = process.env.BASIN_WEBHOOK_SECRET;

function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const json = JSON.stringify({ id: 'sub_123', email: 'a@example.com', name: 'Ann' });
const wrapped = JSON.stringify({ data: { id: 'sub_124', email: 'b@example.com' } });
const form = 'id=sub_125&email=c%40example.com&name=Cy+Dee';

describe('verifyBasinSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyBasinSignature(Buffer.from(json), sign(json), SECRET)).toBe(true);
  });
  it('rejects wrong secret, missing prefix, missing header, bad hex, wrong length', () => {
    expect(verifyBasinSignature(Buffer.from(json), sign(json, 'other'), SECRET)).toBe(false);
    expect(verifyBasinSignature(Buffer.from(json), sign(json).slice(7), SECRET)).toBe(false);
    expect(verifyBasinSignature(Buffer.from(json), undefined, SECRET)).toBe(false);
    expect(verifyBasinSignature(Buffer.from(json), 'sha256=' + 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyBasinSignature(Buffer.from(json), 'sha256=abcd', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/basin', () => {
  it.each([
    ['JSON', json, 'application/json'],
    ['data wrapped JSON', wrapped, 'application/json'],
    ['form-urlencoded', form, 'application/x-www-form-urlencoded'],
    ['unusual content type', json, 'text/plain'],
  ])('accepts a signed %s submission', async (_n, body, type) => {
    const res = await request(app)
      .post('/webhooks/basin')
      .set('Content-Type', type)
      .set('X-Basin-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each(['null', '42', '[1,2]'])('answers 400, not 500, for a signed non-object JSON body %s', async (body) => {
    const res = await request(app)
      .post('/webhooks/basin')
      .set('Content-Type', 'application/json')
      .set('X-Basin-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects an unsigned request', async () => {
    const res = await request(app).post('/webhooks/basin').set('Content-Type', 'application/json').send(json);
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const res = await request(app)
      .post('/webhooks/basin')
      .set('Content-Type', 'application/json')
      .set('X-Basin-Signature', sign(json, 'wrong'))
      .send(json);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await request(app)
      .post('/webhooks/basin')
      .set('Content-Type', 'application/json')
      .set('X-Basin-Signature', sign(json))
      .send(json.replace('Ann', 'Eve'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    const res = await request(app)
      .post('/webhooks/basin')
      .set('Content-Type', 'application/json')
      .set('X-Basin-Signature', sign(bad))
      .send(bad);
    expect(res.status).toBe(400);
  });
});
