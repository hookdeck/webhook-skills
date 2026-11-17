const request = require('supertest');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.DIAL_WEBHOOK_SECRET = 'whsec_test_dial_secret';
delete process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS;

const app = require('../src/index.js');

const now = () => Math.floor(Date.now() / 1000);

// X-Dial-Signature: t=<ts>,v1=<hex HMAC-SHA256 of `${t}.${body}`>, keyed with the full whsec_ secret
function sign(body, { t = now(), secret = process.env.DIAL_WEBHOOK_SECRET } = {}) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function envelope(type, data = {}) {
  return JSON.stringify({
    id: 'evt_3f9a2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90',
    object: 'event',
    type,
    version: type === 'number.status_changed' ? 2 : 1,
    createdAt: '2026-05-28T14:32:08.412Z',
    relatedObject: null,
    data,
  });
}

const EVENTS = [
  ['message.received', { messageId: 'msg_1', from: '+14155550123', to: '+14155559876', channel: 'sms', body: 'hi', media: [] }],
  ['message.status_changed', { messageId: 'msg_1', changed: 'delivery', deliveryState: 'delivered', readState: 'unsupported' }],
  ['call.status_changed', { callId: 'call_1', status: { state: 'Ringing', label: 'Ringing' }, previousState: 'Queued' }],
  ['call.ended', { callId: 'call_1', direction: 'inbound', durationSeconds: 47, status: 'completed', canceled: false }],
  ['call.transcribed', { callId: 'call_1' }],
  ['number.status_changed', { phoneNumberId: 'pn_1', number: '+14155550123', status: 'ready', changed: [], capabilities: {} }],
  ['webhook.ping', {}],
];

describe('Dial webhook handler', () => {
  const post = (body, headers = {}) =>
    request(app).post('/webhooks/dial').set('Content-Type', 'application/json').set(headers).send(body);

  afterEach(() => {
    delete process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS;
  });

  it.each(EVENTS)('accepts a correctly signed %s event', async (type, data) => {
    const body = envelope(type, data);
    const res = await post(body, { 'X-Dial-Signature': sign(body), 'X-Dial-Event-ID': 'evt_1', 'X-Dial-Event-Type': type });
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = envelope('webhook.ping');
    const res = await request(app)
      .post('/webhooks/dial')
      .set('Content-Type', 'text/plain')
      .set('X-Dial-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts any matching v1 entry', async () => {
    const body = envelope('call.ended');
    const t = now();
    const good = sign(body, { t }).split(',')[1];
    const res = await post(body, { 'X-Dial-Signature': `t=${t},v1=${'0'.repeat(64)},${good}` });
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = envelope('message.received');
    const res = await post(body, { 'X-Dial-Signature': sign(body, { secret: 'whsec_other' }) });
    expect(res.status).toBe(401);
  });

  it('rejects a signature keyed without the whsec_ prefix', async () => {
    const body = envelope('message.received');
    const res = await post(body, { 'X-Dial-Signature': sign(body, { secret: 'test_dial_secret' }) });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const sig = sign(envelope('call.ended'));
    const res = await post(envelope('call.transcribed'), { 'X-Dial-Signature': sig });
    expect(res.status).toBe(401);
  });

  it('rejects a timestamp that was changed after signing', async () => {
    const body = envelope('call.ended');
    const t = now();
    const v1 = sign(body, { t }).split('v1=')[1];
    const res = await post(body, { 'X-Dial-Signature': `t=${t + 1},v1=${v1}` });
    expect(res.status).toBe(401);
  });

  it('rejects a stale timestamp by default', async () => {
    const body = envelope('call.ended');
    const res = await post(body, { 'X-Dial-Signature': sign(body, { t: now() - 600 }) });
    expect(res.status).toBe(401);
  });

  it('accepts a stale timestamp when the tolerance is disabled', async () => {
    process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS = '0';
    const body = envelope('call.ended');
    const res = await post(body, { 'X-Dial-Signature': sign(body, { t: now() - 86400 }) });
    expect(res.status).toBe(200);
  });

  it('rejects malformed signature headers', async () => {
    const body = envelope('call.ended');
    const t = now();
    const v1 = sign(body, { t }).split('v1=')[1];
    for (const bad of [
      v1,
      `t=${t}`,
      `v1=${v1}`,
      `t=abc,v1=${v1}`,
      `t=${t},v1=${'zz'.repeat(32)}`,
      `t=${t},v1=${v1.slice(0, 62)}`,
      `t=${t},v1=${v1}00`,
      `t=${t},v1=sha256=${v1}`,
    ]) {
      const res = await post(body, { 'X-Dial-Signature': bad });
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(envelope('call.ended'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Dial-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('exposes a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
