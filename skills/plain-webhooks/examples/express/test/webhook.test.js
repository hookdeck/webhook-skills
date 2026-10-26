const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.PLAIN_WEBHOOK_SECRET = 'test_plain_hmac_secret';

const app = require('../src/index');

/** hex(HMAC-SHA256(secret, rawBody)) - what Plain sends in Plain-Request-Signature */
function generatePlainSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function makeEvent(eventType, extra = {}, attemptTimestamp = new Date().toISOString()) {
  return JSON.stringify({
    id: 'e_01HD44FHMCDSSWE38N14FSYV6K',
    type: eventType,
    timestamp: '2023-10-19T14:12:25.266Z',
    workspaceId: 'w_01GST0W989ZNAW53X6XYHAY87P',
    payload: { eventType, ...extra },
    webhookMetadata: {
      webhookTargetId: 'wt_01',
      webhookTargetVersion: '2023-10-15',
      webhookDeliveryAttemptId: 'wda_01',
      webhookDeliveryAttemptNumber: 1,
      webhookDeliveryAttemptTimestamp: attemptTimestamp,
    },
  });
}

const secret = process.env.PLAIN_WEBHOOK_SECRET;

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/plain').set('Content-Type', contentType);
  if (signature !== undefined) req.set('Plain-Request-Signature', signature);
  return req.send(body);
}

describe('Plain Webhook Endpoint', () => {
  afterEach(() => {
    delete process.env.PLAIN_TOLERANCE_SECONDS;
  });

  it.each([
    ['thread.thread_created', { thread: { id: 'th_01' } }],
    ['thread.email_received', { email: { id: 'em_01' } }],
    ['thread.thread_status_transitioned', { thread: { id: 'th_01' } }],
    ['customer.customer_created', { customer: { id: 'c_01' } }],
    ['thread.note_created', { note: { id: 'n_01' } }],
  ])('accepts a validly signed %s event', async (eventType, extra) => {
    const body = makeEvent(eventType, extra);
    const res = await post(body, generatePlainSignature(body, secret));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies the raw body for any content type', async () => {
    const body = makeEvent('thread.thread_created', { thread: { id: 'th_01' } });
    const res = await post(body, generatePlainSignature(body, secret), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, generatePlainSignature(body, secret).toUpperCase());
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(makeEvent('thread.thread_created'));
    expect(res.status).toBe(400);
  });

  it('returns 401 for a wrong signature', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, 'a'.repeat(64));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, generatePlainSignature(body, 'other_secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body was modified after signing', async () => {
    const body = makeEvent('thread.thread_created');
    const sig = generatePlainSignature(body, secret);
    const res = await post(body.replace('th_', 'tx_') + ' ', sig);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature of the wrong length', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, generatePlainSignature(body, secret).slice(0, 62));
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-hex 64-char signatures (no truncating hex decode)', async () => {
    const body = makeEvent('thread.thread_created');
    const good = generatePlainSignature(body, secret);
    const res = await post(body, 'zz' + good.slice(2));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature with a trailing non-hex suffix', async () => {
    const body = makeEvent('thread.thread_created');
    const res = await post(body, generatePlainSignature(body, secret) + 'zz');
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, generatePlainSignature(body, secret));
    expect(res.status).toBe(400);
  });

  it('ignores stale timestamps by default (Hookdeck replays are valid)', async () => {
    const body = makeEvent('thread.thread_created', {}, '2020-01-01T00:00:00.000Z');
    const res = await post(body, generatePlainSignature(body, secret));
    expect(res.status).toBe(200);
  });

  it('rejects stale timestamps when PLAIN_TOLERANCE_SECONDS is set', async () => {
    process.env.PLAIN_TOLERANCE_SECONDS = '300';
    const body = makeEvent('thread.thread_created', {}, '2020-01-01T00:00:00.000Z');
    const res = await post(body, generatePlainSignature(body, secret));
    expect(res.status).toBe(400);
  });

  it('accepts fresh timestamps when PLAIN_TOLERANCE_SECONDS is set', async () => {
    process.env.PLAIN_TOLERANCE_SECONDS = '300';
    const body = makeEvent('thread.thread_created');
    const res = await post(body, generatePlainSignature(body, secret));
    expect(res.status).toBe(200);
  });
});
