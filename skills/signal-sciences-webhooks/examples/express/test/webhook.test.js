const request = require('supertest');
const crypto = require('crypto');

// Signing keys are used as raw strings (no encoding or prefix)
process.env.SIGNAL_SCIENCES_SIGNING_KEY = 'test_signing_key';

const { app, verifySignalSciencesWebhook } = require('../src/index');

const signingKey = process.env.SIGNAL_SCIENCES_SIGNING_KEY;

// Same algorithm as Fastly: hex HMAC-SHA256 of the raw JSON body
function sign(payload, key = signingKey) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeEvent(type, payload = {}) {
  return JSON.stringify({
    created: '2024-02-09T21:08:21.31644377Z',
    type,
    payload,
    link: 'dashboard link to event',
    workspaceId: 'www.mysite.com',
  });
}

function post(body, signature) {
  const req = request(app)
    .post('/webhooks/signal-sciences')
    .set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('X-SigSci-Signature', signature);
  return req.send(body);
}

describe('verifySignalSciencesWebhook', () => {
  const body = Buffer.from(makeEvent('flag'));

  it('accepts a valid signature', () => {
    expect(verifySignalSciencesWebhook(body, sign(body), signingKey)).toBe(true);
  });

  it('rejects a signature made with another key', () => {
    expect(verifySignalSciencesWebhook(body, sign(body, 'other'), signingKey)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifySignalSciencesWebhook(Buffer.from(makeEvent('agentAlert')), sign(body), signingKey)).toBe(false);
  });

  it('rejects missing or malformed signatures', () => {
    expect(verifySignalSciencesWebhook(body, undefined, signingKey)).toBe(false);
    expect(verifySignalSciencesWebhook(body, 'not-hex', signingKey)).toBe(false);
    expect(verifySignalSciencesWebhook(body, 'abcd', signingKey)).toBe(false);
  });
});

describe('POST /webhooks/signal-sciences', () => {
  it('returns 400 for a missing signature', async () => {
    const res = await post(makeEvent('flag'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(makeEvent('flag'), 'a'.repeat(64));
    expect(res.status).toBe(400);
  });

  it.each(['flag', 'expireFlag', 'agentAlert', 'loggingModeChanged', 'ruleCreated', 'listDeleted'])(
    'returns 200 for a validly signed %s event',
    async (type) => {
      const body = makeEvent(type, { ID: 'abcde123456789', Slug: 'site.example' });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
    }
  );

  it('returns 200 for unhandled event types', async () => {
    const body = makeEvent('customDashboardCreated');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
