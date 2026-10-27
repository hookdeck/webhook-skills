const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'mg_test_secret_key';
process.env.MEETGEEK_WEBHOOK_SECRET = SECRET;

const { app, verifyMeetGeekSignature } = require('../src/index');

// Documented sample payloads
const SUCCESS = JSON.stringify({
  message: 'File analyzed successfully',
  meeting_id: '9433976b-cfa3-4373-9afb-eb0b7a5915df',
});
const FAILED = JSON.stringify({ message: 'File analyzed failed' });

const sign = (body, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

const post = (body, headers = {}) =>
  request(app)
    .post('/webhooks/meetgeek')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);

describe('MeetGeek webhook', () => {
  test('accepts a successful-analysis delivery', async () => {
    const res = await post(SUCCESS, { 'X-MG-Signature': sign(SUCCESS) });
    expect(res.status).toBe(200);
  });

  test('accepts a failed-analysis delivery', async () => {
    const res = await post(FAILED, { 'X-MG-Signature': sign(FAILED) });
    expect(res.status).toBe(200);
  });

  test('accepts an uppercase hex signature', async () => {
    const res = await post(SUCCESS, { 'X-MG-Signature': sign(SUCCESS).toUpperCase() });
    expect(res.status).toBe(200);
  });

  test('verifies any content type over the exact bytes', async () => {
    const res = await request(app)
      .post('/webhooks/meetgeek')
      .set('Content-Type', 'text/plain')
      .set('X-MG-Signature', sign(SUCCESS))
      .send(SUCCESS);
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature', async () => {
    expect((await post(SUCCESS)).status).toBe(401);
  });

  test('rejects an empty signature', async () => {
    expect((await post(SUCCESS, { 'X-MG-Signature': '' })).status).toBe(401);
  });

  test('rejects a malformed signature', async () => {
    expect((await post(SUCCESS, { 'X-MG-Signature': 'sha256=' + sign(SUCCESS) })).status).toBe(401);
    expect((await post(SUCCESS, { 'X-MG-Signature': 'zz'.repeat(32) })).status).toBe(401);
    expect((await post(SUCCESS, { 'X-MG-Signature': sign(SUCCESS).slice(2) })).status).toBe(401);
  });

  test('rejects a signature from the wrong secret', async () => {
    const res = await post(SUCCESS, { 'X-MG-Signature': sign(SUCCESS, 'other_secret') });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const res = await post(FAILED, { 'X-MG-Signature': sign(SUCCESS) });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-MG-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  test('verifyMeetGeekSignature is false for non-string input', () => {
    expect(verifyMeetGeekSignature(Buffer.from(SUCCESS), undefined, SECRET)).toBe(false);
  });
});
