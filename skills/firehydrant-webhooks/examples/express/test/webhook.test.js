const request = require('supertest');
const crypto = require('crypto');

process.env.FIREHYDRANT_WEBHOOK_SECRET = 'test_firehydrant_secret';

const { app, verifyFireHydrantWebhook } = require('../src/index');

// Same algorithm FireHydrant uses: bare hex HMAC-SHA256 of the raw body
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const secret = process.env.FIREHYDRANT_WEBHOOK_SECRET;

const incidentPayload = JSON.stringify({
  data: { incident: { number: 602, name: 'Test incident', current_milestone: 'resolved' } },
  event: { operation: 'UPDATED', resource_type: 'incident' },
});
const changeEventPayload = JSON.stringify({
  data: { id: '489d7b90', summary: 'Production Deploy' },
  event: { operation: 'updated', resource_type: 'change_event' },
});
const alertPayload = JSON.stringify({
  data: { alert: { id: '6f76', summary: 'High error rate', status: 'opened', decision: null } },
  event: { operation: 'CREATED', resource_type: 'signals_alerts' },
});

describe('verifyFireHydrantWebhook', () => {
  it('accepts a valid signature', () => {
    const body = Buffer.from(incidentPayload);
    expect(verifyFireHydrantWebhook(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyFireHydrantWebhook(Buffer.from(incidentPayload), 'invalid', secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyFireHydrantWebhook(Buffer.from(incidentPayload), undefined, secret)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyFireHydrantWebhook(Buffer.from(incidentPayload), sign(incidentPayload, 'other'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = sign(incidentPayload, secret);
    expect(verifyFireHydrantWebhook(Buffer.from(incidentPayload + ' '), sig, secret)).toBe(false);
  });

  it('does not accept a sha256= prefixed signature', () => {
    const sig = `sha256=${sign(incidentPayload, secret)}`;
    expect(verifyFireHydrantWebhook(Buffer.from(incidentPayload), sig, secret)).toBe(false);
  });
});

describe('POST /webhooks/firehydrant', () => {
  const post = (body, signature, contentType = 'application/json') => {
    const req = request(app).post('/webhooks/firehydrant').set('Content-Type', contentType);
    if (signature) req.set('fh-signature', signature);
    return req.send(body);
  };

  it('returns 400 for a missing signature', async () => {
    const res = await post(incidentPayload);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(incidentPayload, 'deadbeef');
    expect(res.status).toBe(400);
  });

  it('handles an incident event', async () => {
    const res = await post(incidentPayload, sign(incidentPayload, secret));
    expect(res.status).toBe(200);
  });

  it('handles a change_event event', async () => {
    const res = await post(changeEventPayload, sign(changeEventPayload, secret));
    expect(res.status).toBe(200);
  });

  it('handles a signals_alerts event', async () => {
    const res = await post(alertPayload, sign(alertPayload, secret));
    expect(res.status).toBe(200);
  });

  it('verifies when the content type is not JSON', async () => {
    const res = await post(incidentPayload, sign(incidentPayload, secret), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown resource types', async () => {
    const body = JSON.stringify({ data: {}, event: { operation: 'CREATED', resource_type: 'other' } });
    const res = await post(body, sign(body, secret));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await post('not json', sign('not json', secret), 'text/plain');
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
