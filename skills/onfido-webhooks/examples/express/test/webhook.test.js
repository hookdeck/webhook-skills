const request = require('supertest');
const crypto = require('crypto');

// Webhook tokens are opaque strings; Onfido uses the raw UTF-8 string as the HMAC key
process.env.ONFIDO_WEBHOOK_TOKEN = 'test_onfido_webhook_token';

const { app, verifyOnfidoWebhook } = require('../src/index');

function sign(body, token = process.env.ONFIDO_WEBHOOK_TOKEN) {
  return crypto.createHmac('sha256', token).update(body).digest('hex');
}

function event(action, resourceType, object = { id: 'abc123', status: 'complete' }) {
  return JSON.stringify({ payload: { resource_type: resourceType, action, object } });
}

describe('verifyOnfidoWebhook', () => {
  const body = Buffer.from(event('check.completed', 'check'));

  it('returns the parsed event for a valid signature', () => {
    const result = verifyOnfidoWebhook(body, sign(body), process.env.ONFIDO_WEBHOOK_TOKEN);
    expect(result.payload.action).toBe('check.completed');
  });

  it('returns null for a wrong signature', () => {
    expect(verifyOnfidoWebhook(body, sign(body, 'other_token'), process.env.ONFIDO_WEBHOOK_TOKEN)).toBeNull();
  });

  it('returns null for a malformed or wrong-length signature', () => {
    expect(verifyOnfidoWebhook(body, 'not-hex', process.env.ONFIDO_WEBHOOK_TOKEN)).toBeNull();
    expect(verifyOnfidoWebhook(body, 'abcd', process.env.ONFIDO_WEBHOOK_TOKEN)).toBeNull();
  });

  it('returns null for a missing signature', () => {
    expect(verifyOnfidoWebhook(body, undefined, process.env.ONFIDO_WEBHOOK_TOKEN)).toBeNull();
  });
});

describe('POST /webhooks/onfido', () => {
  const post = (body, signature) => {
    const req = request(app).post('/webhooks/onfido').set('Content-Type', 'application/json');
    if (signature) req.set('X-SHA2-Signature', signature);
    return req.send(body);
  };

  it.each([
    ['check.completed', 'check'],
    ['report.completed', 'report'],
    ['workflow_run.completed', 'workflow_run'],
    ['workflow_task.completed', 'workflow_task'],
  ])('accepts a signed %s event', async (action, resourceType) => {
    const body = event(action, resourceType);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed event with an unhandled action', async () => {
    const body = event('watchlist_monitor.matches_updated', 'watchlist_monitor');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await post(event('check.completed', 'check'));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(event('check.completed', 'check'), 'a'.repeat(64));
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const body = event('check.completed', 'check');
    const res = await post(body.replace('abc123', 'evil'), sign(body));
    expect(res.status).toBe(400);
  });

  it('verifies the exact raw bytes, including whitespace', async () => {
    const body = '{ "payload" :  {"resource_type":"check","action":"check.completed","object":{"id":"x"}} }';
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });
});
