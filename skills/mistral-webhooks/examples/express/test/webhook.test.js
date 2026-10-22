const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_mistral_endpoint_secret';
process.env.MISTRAL_WEBHOOK_SECRET = SECRET;

const { app, verifyMistralWebhook } = require('../src/index');

function sign(body, secret = SECRET) {
  return 'hmac-sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const callStarted = JSON.stringify({
  event: 'call_started',
  created_at: '2026-09-08T14:32:10Z',
  data: { session_id: 'RM_a1b2c3d4e5f6', agent_id: 'ag_1', model: 'mistral-small-latest', started_at: 1725802330 }
});
const callEnded = JSON.stringify({
  event: 'call_ended',
  created_at: '2026-09-08T14:35:42Z',
  data: {
    session_id: 'RM_a1b2c3d4e5f6', agent_id: 'ag_1', model: 'mistral-small-latest',
    duration_seconds: 212, started_at: 1725802330, ended_at: 1725802542,
    transcript: [{ role: 'assistant', content: 'Hello!' }]
  }
});
const callFailed = JSON.stringify({
  event: 'call_failed',
  created_at: '2026-09-08T14:32:11Z',
  data: { session_id: 'RM_a1b2c3d4e5f6', agent_id: 'ag_1', model: 'mistral-small-latest', error: 'livekit_error' }
});

describe('verifyMistralWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyMistralWebhook(Buffer.from(callStarted), sign(callStarted), SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyMistralWebhook(Buffer.from(callStarted), sign(callStarted, 'other'), SECRET)).toBe(false);
  });

  it('rejects a header without the hmac-sha256= prefix', () => {
    const bare = sign(callStarted).replace('hmac-sha256=', '');
    expect(verifyMistralWebhook(Buffer.from(callStarted), bare, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyMistralWebhook(Buffer.from(callStarted + ' '), sign(callStarted), SECRET)).toBe(false);
  });

  it('rejects a missing header and a length mismatch', () => {
    expect(verifyMistralWebhook(Buffer.from(callStarted), undefined, SECRET)).toBe(false);
    expect(verifyMistralWebhook(Buffer.from(callStarted), 'hmac-sha256=abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/mistral', () => {
  const post = (body, headers = {}) =>
    request(app).post('/webhooks/mistral').set('Content-Type', 'application/json').set(headers).send(body);

  it.each([
    ['call_started', callStarted],
    ['call_ended', callEnded],
    ['call_failed', callFailed],
  ])('accepts a signed %s event', async (_name, body) => {
    const res = await post(body, { 'x-mistral-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/mistral')
      .set('Content-Type', 'text/plain')
      .set('x-mistral-signature', sign(callStarted))
      .send(callStarted);
    expect(res.status).toBe(200);
  });

  it('accepts an unknown event type once verified', async () => {
    const body = JSON.stringify({ event: 'call_paused', data: {} });
    const res = await post(body, { 'x-mistral-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(callStarted, { 'x-mistral-signature': sign(callStarted, 'wrong') });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing signature', async () => {
    const res = await post(callStarted);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, { 'x-mistral-signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
