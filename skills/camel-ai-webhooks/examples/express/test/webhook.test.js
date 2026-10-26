const crypto = require('crypto');
const request = require('supertest');

// camelAI secrets are "whsec_" + base64 of the key bytes.
const SECRET = 'whsec_' + Buffer.from('test_secret_key_for_camel_ai_hooks').toString('base64');
process.env.CAMEL_AI_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function sign(id, timestamp, body, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const digest = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${digest}`;
}

function makeEvent(type = 'run.completed', id = 'evt_test_123') {
  return JSON.stringify({ id, type, created: Math.floor(Date.now() / 1000), data: { example: true } });
}

function post(body, headers) {
  return request(app).post('/webhooks/camel-ai').set('Content-Type', 'application/json').set(headers).send(body);
}

function signedHeaders(body, { prefix = 'webhook', id = 'evt_test_123', timestamp, secret } = {}) {
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  return {
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: sign(id, ts, body, secret),
  };
}

describe('camelAI webhook handler', () => {
  it('accepts a valid webhook-* signed delivery', async () => {
    const body = makeEvent();
    const res = await post(body, signedHeaders(body, { id: 'evt_valid_1' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const body = makeEvent('run.started', 'evt_svix_1');
    const res = await post(body, signedHeaders(body, { prefix: 'svix', id: 'evt_svix_1' }));
    expect(res.status).toBe(200);
  });

  it.each([
    'run.started', 'run.completed', 'run.failed', 'input.requested', 'input.resolved',
    'usage.recorded', 'voice.session.started', 'voice.session.ended', 'voice.session.error',
    'voice.utterance', 'voice.speech.started', 'voice.speech.ended', 'billing.balance.low',
    'billing.balance.depleted', 'end_user.balance.low', 'end_user.credit.exhausted',
    'end_user.credit.granted', 'end_user.credit.refunded', 'end_user.credit.adjusted',
    'end_user.allowance.low',
  ])('handles %s', async (type) => {
    const id = `evt_${type}`;
    const body = makeEvent(type, id);
    const res = await post(body, signedHeaders(body, { id }));
    expect(res.status).toBe(200);
  });

  it('accepts any content type because the raw bytes are verified', async () => {
    const body = makeEvent('run.failed', 'evt_ct_1');
    const res = await request(app)
      .post('/webhooks/camel-ai')
      .set('Content-Type', 'text/plain')
      .set(signedHeaders(body, { id: 'evt_ct_1' }))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts a signature list where one v1 entry matches', async () => {
    const body = makeEvent('usage.recorded', 'evt_multi_1');
    const headers = signedHeaders(body, { id: 'evt_multi_1' });
    headers['webhook-signature'] = `v1,${Buffer.from('wrong').toString('base64')} ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const body = makeEvent();
    const headers = signedHeaders(body, { id: 'evt_tamper_1' });
    const res = await post(body.replace('run.completed', 'run.failed'), headers);
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const body = makeEvent();
    const other = 'whsec_' + Buffer.from('some_other_endpoint_secret').toString('base64');
    const res = await post(body, signedHeaders(body, { id: 'evt_other_1', secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute window', async () => {
    const body = makeEvent();
    const old = Math.floor(Date.now() / 1000) - 600;
    const res = await post(body, signedHeaders(body, { id: 'evt_old_1', timestamp: old }));
    expect(res.status).toBe(400);
  });

  it('rejects missing signature headers', async () => {
    const res = await post(makeEvent(), {});
    expect(res.status).toBe(400);
  });

  it('rejects a missing body', async () => {
    const res = await request(app).post('/webhooks/camel-ai').set(signedHeaders('', { id: 'evt_empty' }));
    expect(res.status).toBe(400);
  });

  it('acknowledges a retried delivery without reprocessing it', async () => {
    const body = makeEvent('run.completed', 'evt_dup_1');
    const headers = signedHeaders(body, { id: 'evt_dup_1' });
    const first = await post(body, headers);
    const second = await post(body, headers);
    expect(first.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('fails closed when no secret is configured', async () => {
    const body = makeEvent();
    const headers = signedHeaders(body, { id: 'evt_nosecret' });
    delete process.env.CAMEL_AI_WEBHOOK_SECRET;
    try {
      const res = await post(body, headers);
      expect(res.status).toBe(500);
    } finally {
      process.env.CAMEL_AI_WEBHOOK_SECRET = SECRET;
    }
  });
});
