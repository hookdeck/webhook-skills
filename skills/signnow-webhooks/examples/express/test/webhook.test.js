// Generated with: signnow-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');
const crypto = require('crypto');

// SignNow lets you pick any string (up to 300 chars) as the subscription secret_key.
const SECRET = 'my-signnow-secret-key';
process.env.SIGNNOW_WEBHOOK_SECRET = SECRET;

const { app, verifySignNowSignature } = require('../src/index');

// Same algorithm as SignNow: base64(HMAC-SHA256(secret as UTF-8, raw body)).
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function makePayload(event, content = {}) {
  return {
    meta: {
      timestamp: 1728310375,
      event,
      environment: 'https://app.signnow.com/api',
      callback_url: 'https://example.com/webhooks/signnow',
      access_token: '********',
    },
    content,
  };
}

function post(body, headers = {}) {
  return request(app).post('/webhooks/signnow').set(headers).send(body);
}

describe('SignNow webhook handler', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.SIGNNOW_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => jest.restoreAllMocks());

  test('accepts a valid signature for document.complete', async () => {
    const body = JSON.stringify(makePayload('document.complete', { document_id: 'doc1', document_name: 'NDA' }));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-SignNow-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('document.complete'));
  });

  test('verifies regardless of content type (raw body)', async () => {
    const body = JSON.stringify(makePayload('document.update', { document_id: 'doc1' }));
    const res = await post(body, { 'Content-Type': 'text/plain', 'X-SignNow-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  test('rejects an invalid signature', async () => {
    const body = JSON.stringify(makePayload('document.complete', { document_id: 'doc1' }));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-SignNow-Signature': sign(body, 'wrong') });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a body modified after signing', async () => {
    const body = JSON.stringify(makePayload('document.complete', { document_id: 'doc1' }));
    const sig = sign(body);
    const res = await post(body.replace('doc1', 'doc2'), { 'Content-Type': 'application/json', 'X-SignNow-Signature': sig });
    expect(res.status).toBe(400);
  });

  test('rejects a missing signature header (unsigned delivery)', async () => {
    const body = JSON.stringify(makePayload('document.complete'));
    const res = await post(body, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing/);
  });

  test('rejects a hex-encoded signature (must be base64)', async () => {
    const body = JSON.stringify(makePayload('document.complete'));
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const res = await post(body, { 'Content-Type': 'application/json', 'X-SignNow-Signature': hex });
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.SIGNNOW_WEBHOOK_SECRET;
    const body = JSON.stringify(makePayload('document.complete'));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-SignNow-Signature': sign(body) });
    expect(res.status).toBe(500);
  });

  test('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { 'Content-Type': 'text/plain', 'X-SignNow-Signature': sign(body) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test.each([
    ['document.open', { document_id: 'd' }],
    ['document.update', { document_id: 'd' }],
    ['document.delete', { document_id: 'd' }],
    ['document.fieldinvite.sent', { document_id: 'd' }],
    ['document.fieldinvite.signed', { document_id: 'd' }],
    ['document.fieldinvite.decline', { document_id: 'd' }],
    ['user.document.complete', { document_id: 'd', user_id: 'u' }],
    ['document_group.complete', { group_id: 'g' }],
    ['document_group.invite.signer.complete', { group_id: 'g', signer_email: 's@example.com' }],
  ])('handles %s', async (event, content) => {
    const body = JSON.stringify(makePayload(event, content));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-SignNow-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  test('acknowledges unknown events', async () => {
    const body = JSON.stringify(makePayload('template.copy'));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-SignNow-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled SignNow event: template.copy'));
  });

  test('verifySignNowSignature handles length mismatch and empty inputs', () => {
    const body = Buffer.from('{}');
    expect(verifySignNowSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifySignNowSignature(body, 'short', SECRET)).toBe(false);
    expect(verifySignNowSignature(body, '', SECRET)).toBe(false);
    expect(verifySignNowSignature(body, sign(body), '')).toBe(false);
  });
});
