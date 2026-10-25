const request = require('supertest');
const crypto = require('crypto');

// Teamwork tokens are free-form strings you choose when creating the Version 2 webhook
const token = 'tw_test_token_0123456789';
process.env.TEAMWORK_WEBHOOK_TOKEN = token;

const { app, verifyTeamworkWebhook } = require('../src/index');

/**
 * Generate an X-Projects-Signature value the same way Teamwork does:
 * hex(HMAC-SHA256(token, rawBody))
 */
function generateTeamworkSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function post(body, { event = 'TASK.CREATED', signature, contentType = 'application/json' } = {}) {
  const sig = signature === undefined ? generateTeamworkSignature(body, token) : signature;
  const req = request(app).post('/webhooks/teamwork').set('Content-Type', contentType);
  if (event) req.set('X-Projects-Event', event);
  if (sig !== null) req.set('X-Projects-Signature', sig);
  return req.send(body);
}

describe('verifyTeamworkWebhook', () => {
  const body = '{"eventCreator":{"id":1},"task":{"id":42}}';

  it('accepts a valid signature', () => {
    const sig = generateTeamworkSignature(body, token);
    expect(verifyTeamworkWebhook(Buffer.from(body), sig, token)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    const sig = generateTeamworkSignature(body, token).toUpperCase();
    expect(verifyTeamworkWebhook(Buffer.from(body), sig, token)).toBe(true);
  });

  it('rejects a signature made with another token', () => {
    const sig = generateTeamworkSignature(body, 'other');
    expect(verifyTeamworkWebhook(Buffer.from(body), sig, token)).toBe(false);
  });

  it('rejects a modified body', () => {
    const sig = generateTeamworkSignature(body, token);
    expect(verifyTeamworkWebhook(Buffer.from(body + ' '), sig, token)).toBe(false);
  });

  it('rejects missing signature or token', () => {
    expect(verifyTeamworkWebhook(Buffer.from(body), undefined, token)).toBe(false);
    expect(verifyTeamworkWebhook(Buffer.from(body), 'a'.repeat(64), undefined)).toBe(false);
  });

  it('rejects wrong-length and non-hex signatures', () => {
    expect(verifyTeamworkWebhook(Buffer.from(body), 'abc123', token)).toBe(false);
    expect(verifyTeamworkWebhook(Buffer.from(body), 'z'.repeat(64), token)).toBe(false);
    // Valid digest followed by junk must not pass via hex truncation
    const sig = generateTeamworkSignature(body, token);
    expect(verifyTeamworkWebhook(Buffer.from(body), sig + 'zz', token)).toBe(false);
  });
});

describe('POST /webhooks/teamwork', () => {
  it('accepts a valid TASK.CREATED event', async () => {
    const body = JSON.stringify({ eventCreator: { id: 1 }, task: { id: 42 } });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    'TASK.UPDATED',
    'TASK.COMPLETED',
    'TASK.DELETED',
    'PROJECT.CREATED',
    'COMMENT.CREATED',
    'MILESTONE.COMPLETED',
    'TIME.CREATED',
    'FILE.DOWNLOADED',
  ])('accepts %s', async (event) => {
    const body = JSON.stringify({ eventCreator: { id: 1 }, id: 7, projectId: 3 });
    const res = await post(body, { event });
    expect(res.status).toBe(200);
  });

  it('verifies any content type (raw body)', async () => {
    const body = JSON.stringify({ eventCreator: { id: 1 }, project: { id: 9 } });
    const res = await post(body, { event: 'PROJECT.CREATED', contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature with 401', async () => {
    const res = await post('{"task":{"id":1}}', { signature: 'a'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature with 401', async () => {
    const res = await post('{"task":{"id":1}}', { signature: null });
    expect(res.status).toBe(401);
  });

  it('rejects a signature for a tampered body', async () => {
    const sig = generateTeamworkSignature('{"task":{"id":1}}', token);
    const res = await post('{"task":{"id":2}}', { signature: sig });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  it('exposes a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
