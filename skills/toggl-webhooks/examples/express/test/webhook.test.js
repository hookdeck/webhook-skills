const request = require('supertest');
const crypto = require('crypto');

// Docs test vector (engineering.toggl.com "Validating Received Events")
const DOCS_SECRET = 'PGuRrhCFajIyEvFlreKL';
const DOCS_PING_BODY =
  '{"event_id":0,"created_at":"2022-06-25T03:58:10.207820267Z","creator_id":6,"metadata":{"request_type":"POST","event_user_id":6},"payload":"ping","subscription_id":6,"timestamp":"2022-06-25T03:58:10.207820267Z","url_callback":"https://callback-url.com"}';
const DOCS_PING_SIGNATURE =
  'sha256=bf829606cda0ca6923defb5ca70a43135adc7e8887486a201a19cb50ca6006b1';

process.env.TOGGL_WEBHOOK_SECRET = DOCS_SECRET;

const { app, verifyTogglWebhook } = require('../src/index');

function sign(body, secret = DOCS_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function entityEvent(model, action, payload = {}) {
  return JSON.stringify({
    event_id: 42,
    creator_id: 6,
    metadata: { action, model, event_user_id: 6, request_type: 'POST' },
    payload,
    subscription_id: 6,
    timestamp: '2024-01-01T00:00:00Z',
    url_callback: 'https://callback-url.com',
  });
}

describe('verifyTogglWebhook', () => {
  it('accepts the documented test vector', () => {
    expect(verifyTogglWebhook(Buffer.from(DOCS_PING_BODY), DOCS_PING_SIGNATURE, DOCS_SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyTogglWebhook(Buffer.from(DOCS_PING_BODY), DOCS_PING_SIGNATURE, 'other')).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyTogglWebhook(Buffer.from(DOCS_PING_BODY + ' '), DOCS_PING_SIGNATURE, DOCS_SECRET)).toBe(false);
  });

  it('rejects missing, malformed or unprefixed signatures', () => {
    const body = Buffer.from(DOCS_PING_BODY);
    expect(verifyTogglWebhook(body, undefined, DOCS_SECRET)).toBe(false);
    expect(verifyTogglWebhook(body, 'sha256=short', DOCS_SECRET)).toBe(false);
    expect(verifyTogglWebhook(body, DOCS_PING_SIGNATURE.replace('sha256=', ''), DOCS_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/toggl', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/toggl')
      .set('Content-Type', 'application/json')
      .send(DOCS_PING_BODY);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/toggl')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature-256', 'sha256=' + 'a'.repeat(64))
      .send(DOCS_PING_BODY);
    expect(res.status).toBe(400);
  });

  it('accepts the documented PING and returns 200', async () => {
    const res = await request(app)
      .post('/webhooks/toggl')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature-256', DOCS_PING_SIGNATURE)
      .send(DOCS_PING_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('echoes validation_code on PING for a non-validated subscription', async () => {
    const body = JSON.stringify({
      ...JSON.parse(DOCS_PING_BODY),
      validation_code: 'abc123',
    });
    const res = await request(app)
      .post('/webhooks/toggl')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ validation_code: 'abc123' });
  });

  it('verifies regardless of the request content type', async () => {
    const body = entityEvent('time_entry', 'created', { description: 'Work' });
    const res = await request(app)
      .post('/webhooks/toggl')
      .set('Content-Type', 'text/plain')
      .set('X-Webhook-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it.each([
    ['time_entry', 'created'],
    ['time_entry', 'updated'],
    ['time_entry', 'deleted'],
    ['project', 'created'],
    ['project', 'updated'],
    ['project', 'deleted'],
    ['tag', 'created'],
  ])('handles %s %s', async (model, action) => {
    const body = entityEvent(model, action, { id: 1, name: 'x', description: 'y' });
    const res = await request(app)
      .post('/webhooks/toggl')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/toggl')
      .set('Content-Type', 'text/plain')
      .set('X-Webhook-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
