const request = require('supertest');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.AGENTLINE_WEBHOOK_SECRET = 'test_agentline_secret';

const app = require('../src/index.js');

// Bare hex HMAC-SHA256 of the raw body, keyed with the secret
function sign(body, secret = process.env.AGENTLINE_WEBHOOK_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const EVENTS = [
  'call.received',
  'call.utterance',
  'call.completed',
  'call.owner_task',
  'call.failed',
  'call.busy',
  'call.no-answer',
  'call.canceled',
  'sms.received',
  'webhook.test',
];

describe('AgentLine webhook handler', () => {
  const post = (body, headers = {}) =>
    request(app).post('/webhooks/agentline').set('Content-Type', 'application/json').set(headers).send(body);

  it.each(EVENTS)('accepts a correctly signed %s event', async (type) => {
    const body = JSON.stringify({ event_id: 'evt_1', agent_id: 'ag_1', event_type: type, payload: {} });
    const res = await post(body, { 'X-Webhook-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = JSON.stringify({ event_type: 'webhook.test' });
    const res = await request(app)
      .post('/webhooks/agentline')
      .set('Content-Type', 'text/plain')
      .set('X-Webhook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify({ event_type: 'webhook.test' });
    const res = await post(body, { 'X-Webhook-Signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify({ event_type: 'call.completed' });
    const res = await post(body, { 'X-Webhook-Signature': sign(body, 'other') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify({ event_type: 'call.completed' });
    const sig = sign(body);
    const res = await post(JSON.stringify({ event_type: 'call.failed' }), { 'X-Webhook-Signature': sig });
    expect(res.status).toBe(401);
  });

  it('rejects non-hex and wrong-length signatures', async () => {
    const body = JSON.stringify({ event_type: 'call.completed' });
    for (const bad of ['zz'.repeat(32), sign(body).slice(0, 62), sign(body) + '00', 'sha256=' + sign(body)]) {
      const res = await post(body, { 'X-Webhook-Signature': bad });
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(JSON.stringify({ event_type: 'call.completed' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Webhook-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('exposes a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
