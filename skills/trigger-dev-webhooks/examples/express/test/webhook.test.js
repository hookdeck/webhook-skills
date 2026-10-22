const request = require('supertest');
const crypto = require('crypto');

process.env.TRIGGER_DEV_WEBHOOK_SECRET = 'test_trigger_dev_alert_secret';

const { app, verifyTriggerDevWebhook } = require('../src/index');

// Bare hex HMAC-SHA256 of the raw body, keyed with the secret as UTF-8
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const secret = process.env.TRIGGER_DEV_WEBHOOK_SECRET;
const HEADER = 'x-trigger-signature-hmacsha256';

function post(payload, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/trigger-dev').set('Content-Type', contentType);
  if (signature) req.set(HEADER, signature);
  return req.send(payload);
}

const base = { id: 'evt_1', created: '2026-01-01T00:00:00.000Z', webhookVersion: '2025-01-01' };

const events = {
  'alert.run.failed': {
    ...base,
    type: 'alert.run.failed',
    object: { task: { id: 'my-task' }, run: { id: 'run_1', dashboardUrl: 'https://cloud.trigger.dev/run_1' } },
  },
  'alert.deployment.success': {
    ...base,
    type: 'alert.deployment.success',
    object: { deployment: { version: '20260101.1' }, environment: { type: 'PRODUCTION' } },
  },
  'alert.deployment.failed': {
    ...base,
    type: 'alert.deployment.failed',
    object: { deployment: { version: '20260101.2' }, error: { name: 'BuildError', message: 'boom' } },
  },
  'alert.error': {
    ...base,
    type: 'alert.error',
    object: { classification: 'new_issue', error: { fingerprint: 'abc', message: 'oops' } },
  },
};

describe('verifyTriggerDevWebhook', () => {
  it('accepts a valid signature', () => {
    const body = Buffer.from('{"type":"alert.run.failed"}');
    expect(verifyTriggerDevWebhook(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = Buffer.from('{"type":"alert.run.failed"}');
    expect(verifyTriggerDevWebhook(body, 'invalid', secret)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const body = Buffer.from('{"type":"alert.run.failed"}');
    expect(verifyTriggerDevWebhook(body, sign(body, 'other'), secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyTriggerDevWebhook(Buffer.from('{}'), undefined, secret)).toBe(false);
  });
});

describe('POST /webhooks/trigger-dev', () => {
  it('returns 400 for a missing signature', async () => {
    const res = await post(JSON.stringify(events['alert.run.failed']));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(JSON.stringify(events['alert.run.failed']), 'a'.repeat(64));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 when the body is modified after signing', async () => {
    const payload = JSON.stringify(events['alert.run.failed']);
    const res = await post(payload + ' ', sign(payload, secret));
    expect(res.status).toBe(400);
  });

  it.each(Object.keys(events))('handles %s', async (type) => {
    const payload = JSON.stringify(events[type]);
    const res = await post(payload, sign(payload, secret));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const payload = JSON.stringify(events['alert.deployment.success']);
    const res = await post(payload, sign(payload, secret), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const payload = JSON.stringify({ ...base, type: 'alert.future', object: {} });
    const res = await post(payload, sign(payload, secret));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const payload = 'not json';
    const res = await post(payload, sign(payload, secret), 'text/plain');
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
