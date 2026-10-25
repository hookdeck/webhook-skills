const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'secret-key';
process.env.JAZZHR_WEBHOOK_SECRET = SECRET;
const app = require('../src/index');

const sign = (body, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');

const post = (body, headers = {}) =>
  request(app)
    .post('/webhooks/jazzhr')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);

describe('POST /webhooks/jazzhr', () => {
  it("reproduces the docs' worked example signature", () => {
    expect(sign('{"data":"JazzHR Verify Event"}')).toBe(
      '4fdc7dcdcb02bca16c7ec4a15b9d6436de1f186e11ff155d0ab178b5aca4f30e'
    );
  });

  it('accepts the signed VERIFY event', async () => {
    const body = '{"data":"JazzHR Verify Event"}';
    const res = await post(body, {
      'X-JazzHR-Event': 'VERIFY',
      'X-JazzHR-Signature': '4fdc7dcdcb02bca16c7ec4a15b9d6436de1f186e11ff155d0ab178b5aca4f30e',
    });
    expect(res.status).toBe(200);
  });

  it('accepts a signed CANDIDATE-EXPORT event', async () => {
    const body = JSON.stringify({ candidate: { person: { id: { value: 'c1' } } } });
    const res = await post(body, { 'X-JazzHR-Event': 'CANDIDATE-EXPORT', 'X-JazzHR-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify({ candidate: {} });
    const res = await request(app)
      .post('/webhooks/jazzhr')
      .set('Content-Type', 'text/plain')
      .set({ 'X-JazzHR-Event': 'CANDIDATE-EXPORT', 'X-JazzHR-Signature': sign(body) })
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify({ candidate: {} });
    const res = await post(body, { 'X-JazzHR-Event': 'CANDIDATE-EXPORT', 'X-JazzHR-Signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify({ candidate: {} });
    const res = await post(body, { 'X-JazzHR-Event': 'CANDIDATE-EXPORT', 'X-JazzHR-Signature': sign(body, 'other') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post('{"candidate":{"x":1}}', {
      'X-JazzHR-Event': 'CANDIDATE-EXPORT',
      'X-JazzHR-Signature': sign('{"candidate":{}}'),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await post('{"candidate":{}}', { 'X-JazzHR-Event': 'CANDIDATE-EXPORT' });
    expect(res.status).toBe(401);
  });

  it('rejects malformed hex without truncating it', async () => {
    const body = JSON.stringify({ candidate: {} });
    const good = sign(body);
    for (const bad of [good.slice(0, 62) + 'zz', good + 'ab', good.slice(0, 32), 'sha256=' + good]) {
      const res = await post(body, { 'X-JazzHR-Event': 'CANDIDATE-EXPORT', 'X-JazzHR-Signature': bad });
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a signed non-JSON export body', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-JazzHR-Event': 'CANDIDATE-EXPORT', 'X-JazzHR-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('acknowledges unknown signed events', async () => {
    const body = '{}';
    const res = await post(body, { 'X-JazzHR-Event': 'SOMETHING-ELSE', 'X-JazzHR-Signature': sign(body) });
    expect(res.status).toBe(200);
  });
});
