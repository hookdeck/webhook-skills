const request = require('supertest');
const crypto = require('crypto');

// whsec_ secrets are used whole as a plain UTF-8 HMAC key (not Standard Webhooks)
const SECRET = 'whsec_test_secret_key_123';
process.env.LEARNHOUSE_WEBHOOK_SECRET = SECRET;
process.env.NODE_ENV = 'test';

const app = require('../src/index');

function hmacHex(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
const sign = (body, secret) => 'sha256=' + hmacHex(body, secret);

let counter = 0;
function envelope(event, data = {}) {
  return JSON.stringify({
    event,
    delivery_id: `dlv_test_${Date.now()}_${counter++}`,
    timestamp: '2026-06-22T12:00:00Z',
    org_id: 1,
    data,
  });
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/learnhouse').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Webhook-Signature', signature);
  return req.send(body);
}

describe('LearnHouse webhook', () => {
  const completed = envelope('course_completed', {
    user: { user_uuid: 'user_1', email: 'learner@example.com', username: 'learner' },
    course: { course_uuid: 'course_1', name: 'Introduction to Python' },
  });

  it('accepts a valid sha256= signature', async () => {
    const res = await post(completed, sign(completed));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the bare digest and uppercase hex', async () => {
    const a = envelope('ping');
    expect((await post(a, hmacHex(a))).status).toBe(200);
    const b = envelope('ping');
    expect((await post(b, 'sha256=' + hmacHex(b).toUpperCase())).status).toBe(200);
  });

  it('verifies any content type using raw bytes', async () => {
    const body = envelope('ping');
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('keys the HMAC with the whole whsec_ string, not a stripped or decoded one', async () => {
    const body = envelope('ping');
    expect((await post(body, sign(body, 'test_secret_key_123'))).status).toBe(401);
    const decoded = Buffer.from(SECRET.slice(6), 'base64');
    const sig = 'sha256=' + crypto.createHmac('sha256', decoded).update(body).digest('hex');
    expect((await post(body, sig)).status).toBe(401);
  });

  it('rejects missing, empty, malformed and wrong signatures with 401', async () => {
    const body = envelope('ping');
    const good = hmacHex(body);
    for (const sig of [undefined, '', 'sha256=', 'sha256=abc', `sha256=${good.slice(0, 63)}z`, `sha256=${good}00`, 'sha1=' + good, sign(body, 'other')]) {
      const res = await post(body, sig);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a tampered body', async () => {
    const body = envelope('ping');
    const res = await post(body.replace('ping', 'pong'), sign(body));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON or not an object', async () => {
    for (const body of ['not json', '[1,2]', '"str"', '{"event":5}', '']) {
      const res = await post(body, sign(body), 'text/plain');
      expect(res.status).toBe(400);
    }
  });

  it('ignores wrong-typed nested fields instead of failing', async () => {
    for (const data of ['x', null, [], { user: 'x', course: [1] }, { user: { email: 5 }, course: { name: {} } }]) {
      const body = envelope('course_completed', data);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    }
  });

  it('handles known and unknown events', async () => {
    for (const event of ['ping', 'course_enrolled', 'activity_completed', 'assignment_submitted', 'assignment_graded', 'certificate_claimed', 'user_signed_up', 'pack_activated']) {
      const body = envelope(event);
      expect((await post(body, sign(body))).status).toBe(200);
    }
  });

  it('flags a repeated delivery_id as a duplicate', async () => {
    const body = envelope('course_enrolled');
    const first = await post(body, sign(body));
    expect(first.body.duplicate).toBeUndefined();
    const second = await post(body, sign(body));
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });
});
