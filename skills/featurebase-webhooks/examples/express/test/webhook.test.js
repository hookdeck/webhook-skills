const crypto = require('crypto');
const request = require('supertest');

// Featurebase secrets look like "whsec_..." and are used WHOLE as a plain UTF-8 HMAC key.
const SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5';
process.env.FEATUREBASE_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function sign(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(String(timestamp), 'latin1'), Buffer.from('.'), Buffer.from(body)]))
    .digest('hex');
}

let counter = 0;
function makeEvent(topic = 'post.created', item = { object: 'post', id: 'p1', title: 'Dark mode' }) {
  counter += 1;
  return JSON.stringify({
    object: 'notification_event',
    id: `notif_test_${counter}_${Date.now()}`,
    topic,
    organizationId: 'org1',
    webhookId: 'wh1',
    createdAt: '2026-10-09T12:00:00.000Z',
    data: { object: 'notification_event_data', item },
  });
}

function send(body, { signature, timestamp, contentType = 'application/json' } = {}) {
  const ts = timestamp === undefined ? Math.floor(Date.now() / 1000) : timestamp;
  const req = request(app).post('/webhooks/featurebase').set('Content-Type', contentType);
  const sig = signature === undefined ? sign(body, ts) : signature;
  if (sig !== null) req.set('X-Webhook-Signature', sig);
  if (ts !== null) req.set('X-Webhook-Timestamp', String(ts));
  return req.send(body);
}

describe('Featurebase webhook', () => {
  beforeEach(() => {
    delete process.env.FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS;
    process.env.FEATUREBASE_WEBHOOK_SECRET = SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('accepts a valid signature', async () => {
    const res = await send(makeEvent());
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  test.each([
    ['post.created'],
    ['post.updated'],
    ['post.voted'],
    ['ticket.created'],
    ['comment.created'],
    ['changelog.published'],
    ['conversation.user.created'],
    ['conversation.admin.assigned'],
    ['conversation.admin.closed'],
    ['post.deleted'],
  ])('handles %s', async (topic) => {
    expect((await send(makeEvent(topic))).status).toBe(200);
  });

  test('accepts uppercase hex (hex is case-insensitive)', async () => {
    const body = makeEvent();
    const ts = Math.floor(Date.now() / 1000);
    expect((await send(body, { timestamp: ts, signature: sign(body, ts).toUpperCase() })).status).toBe(200);
  });

  test('accepts any content type', async () => {
    expect((await send(makeEvent(), { contentType: 'text/plain' })).status).toBe(200);
  });

  test('rejects a tampered body', async () => {
    const body = makeEvent();
    const ts = Math.floor(Date.now() / 1000);
    const res = await send(body.replace('Dark mode', 'Light mode'), { timestamp: ts, signature: sign(body, ts) });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const body = makeEvent();
    const ts = Math.floor(Date.now() / 1000);
    expect((await send(body, { timestamp: ts, signature: sign(body, ts, 'whsec_other') })).status).toBe(401);
  });

  test('uses the whole secret: whsec_ prefix stripped or base64-decoded does not verify', async () => {
    const body = makeEvent();
    const ts = Math.floor(Date.now() / 1000);
    const stripped = SECRET.slice('whsec_'.length);
    expect((await send(body, { timestamp: ts, signature: sign(body, ts, stripped) })).status).toBe(401);
    const decoded = crypto
      .createHmac('sha256', Buffer.from(stripped, 'base64'))
      .update(`${ts}.${body}`)
      .digest('hex');
    expect((await send(body, { timestamp: ts, signature: decoded })).status).toBe(401);
  });

  test('rejects when the signed timestamp header is changed', async () => {
    const body = makeEvent();
    const ts = Math.floor(Date.now() / 1000);
    expect((await send(body, { timestamp: ts + 1, signature: sign(body, ts) })).status).toBe(401);
  });

  test('rejects a missing signature or timestamp', async () => {
    expect((await send(makeEvent(), { signature: null })).status).toBe(401);
    expect((await send(makeEvent(), { timestamp: null, signature: 'a'.repeat(64) })).status).toBe(401);
  });

  test('rejects an empty signature', async () => {
    expect((await send(makeEvent(), { signature: '' })).status).toBe(401);
  });

  test.each([
    ['too short', 'abc123'],
    ['too long', 'a'.repeat(65)],
    ['non-hex characters', 'z'.repeat(64)],
    ['sha256= prefix', 'sha256=' + 'a'.repeat(64)],
    ['base64', Buffer.alloc(32, 1).toString('base64')],
  ])('rejects a malformed signature (%s)', async (_name, signature) => {
    expect((await send(makeEvent(), { signature })).status).toBe(401);
  });

  test('does not reject old timestamps by default (retries keep the original timestamp)', async () => {
    const body = makeEvent();
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await send(body, { timestamp: old })).status).toBe(200);
  });

  test('rejects old timestamps when FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS = '300';
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await send(makeEvent(), { timestamp: old })).status).toBe(401);
    expect((await send(makeEvent())).status).toBe(200);
  });

  test('treats FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS=0 as off', async () => {
    process.env.FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS = '0';
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await send(makeEvent(), { timestamp: old })).status).toBe(200);
  });

  test('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await send(body, { contentType: 'text/plain' })).status).toBe(400);
  });

  test('dedupes a retried event', async () => {
    const body = makeEvent();
    expect((await send(body)).body.duplicate).toBeUndefined();
    expect((await send(body)).body.duplicate).toBe(true);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.FEATUREBASE_WEBHOOK_SECRET;
    expect((await send(makeEvent())).status).toBe(500);
  });
});
