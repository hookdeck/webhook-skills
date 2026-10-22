const crypto = require('crypto');
const request = require('supertest');

const KEY = 'test_api_token_0123456789abcdef';
process.env.WORKABLE_SIGNING_KEY = KEY;
const app = require('../src/index');

const sign = (body, key = KEY) => crypto.createHmac('sha256', key).update(body).digest('hex');
const post = (body, headers = {}) =>
  request(app).post('/webhooks/workable').set(headers).send(body);

describe('POST /webhooks/workable', () => {
  const events = ['candidate_created', 'candidate_moved', 'employee_created', 'employee_updated', 'employee_published'];

  test.each(events)('accepts a validly signed %s event', async (event_type) => {
    const body = JSON.stringify({ id: 'abc123', event_type });
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Workable-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('verifies regardless of content type', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'candidate_created' });
    const res = await post(body, { 'Content-Type': 'text/plain', 'X-Workable-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  test('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'candidate_created' });
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Workable-Signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  test('returns 200 for unhandled events', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'job_deleted' });
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Workable-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  test('rejects a signature made with the wrong key', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'candidate_created' });
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Workable-Signature': sign(body, 'wrong') });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'candidate_created' });
    const sig = sign(body);
    const res = await post(JSON.stringify({ id: 'evil', event_type: 'candidate_created' }), {
      'Content-Type': 'application/json',
      'X-Workable-Signature': sig,
    });
    expect(res.status).toBe(400);
  });

  test('rejects a malformed signature (length mismatch)', async () => {
    const body = JSON.stringify({ id: 'abc123' });
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Workable-Signature': 'abc' });
    expect(res.status).toBe(400);
  });

  test('rejects a missing signature header', async () => {
    const res = await post(JSON.stringify({ id: 'abc123' }), { 'Content-Type': 'application/json' });
    expect(res.status).toBe(400);
  });
});
