const request = require('supertest');
const crypto = require('crypto');

// Kombo Webhook Secret: an arbitrary string used as its UTF-8 bytes (not decoded)
const SECRET = 'test_kombo_webhook_secret';
process.env.KOMBO_WEBHOOK_SECRET = SECRET;

const { app, verifyKomboWebhook } = require('../src/index');

// Sign like Kombo: JSON with two-space indentation, HMAC-SHA256, base64url without padding
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64url');
}

function payload(type, data) {
  return JSON.stringify({ id: '5gjAtURLPbnTiwgkaBfiA3WJ', type, data }, null, 2);
}

function send(body, headers = {}) {
  return request(app)
    .post('/webhooks/kombo')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('verifyKomboWebhook', () => {
  const body = payload('data-changed', { integration_id: 'bombohr:ats-dev' });

  test('accepts a valid signature', () => {
    expect(verifyKomboWebhook(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  test('signature is unpadded base64url', () => {
    expect(sign(body)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('rejects wrong secret, missing header, garbage, and short signatures', () => {
    expect(verifyKomboWebhook(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyKomboWebhook(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifyKomboWebhook(Buffer.from(body), '!!!not-base64!!!', SECRET)).toBe(false);
    expect(verifyKomboWebhook(Buffer.from(body), 'abc', SECRET)).toBe(false);
  });

  test('rejects a compact re-serialization of the body', () => {
    const compact = JSON.stringify(JSON.parse(body));
    expect(verifyKomboWebhook(Buffer.from(compact), sign(body), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/kombo', () => {
  test.each([
    ['data-changed', { integration_id: 'bombohr:ats-dev', changed_models: [{ name: 'ats_applications' }] }],
    ['sync-finished', { sync_id: 'B89SCXXho7Yw8PGo8AKJxLn4', sync_state: 'SUCCEEDED' }],
    ['integration-created', { id: 'personio:CBNMt7dSNCzBdnRTx87dev4E', tool: 'personio', category: 'HRIS' }],
    ['integration-deleted', { id: 'personio:CBNMt7dSNCzBdnRTx87dev4E' }],
    ['integration-state-changed', { integration_id: 'personio:CBNMt7dSNCzBdnRTx87dev4E', state: 'INVALID' }],
    ['connection-flow-failed', { integration_tool: 'personio', log_url: 'https://app.kombo.dev/logs/1' }],
    ['issue-status-changed', { change: 'raised', issue: { type: 'integration.authentication_failed' } }],
    ['assessment:order-received', { id: 'B5KQKhAgTv6ZwzrfAbqbhipd', package_id: 'typescript_test' }],
    ['some-future-event', {}],
  ])('returns 200 for %s with a valid signature', async (type, data) => {
    const body = payload(type, data);
    const res = await send(body, { 'X-Kombo-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  test('verifies regardless of Content-Type', async () => {
    const body = payload('data-changed', {});
    const res = await request(app)
      .post('/webhooks/kombo')
      .set('Content-Type', 'text/plain')
      .set('X-Kombo-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = payload('data-changed', {});
    const res = await send(body, { 'X-Kombo-Signature': sign(body, 'wrong_secret') });
    expect(res.status).toBe(400);
  });

  test('returns 400 when the signature header is missing', async () => {
    const res = await send(payload('data-changed', {}));
    expect(res.status).toBe(400);
  });

  test('returns 400 when the body was tampered with', async () => {
    const body = payload('data-changed', { integration_id: 'a' });
    const res = await send(body.replace('"a"', '"b"'), { 'X-Kombo-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  test('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await send(body, { 'X-Kombo-Signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
