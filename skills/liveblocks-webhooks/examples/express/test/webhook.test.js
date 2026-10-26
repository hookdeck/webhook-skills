const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../src/index');

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function send(
  payload,
  { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'webhook' } = {}
) {
  return request(app)
    .post('/webhooks/liveblocks')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

function envelope(type, data = {}) {
  return JSON.stringify({
    type,
    data: { projectId: 'my-project-id', roomId: 'my-room-id', ...data },
  });
}

// Event names and data fields as documented at https://liveblocks.io/docs/api-reference/webhook-events
const at = '2021-10-06T01:45:56.558Z';
const thread = { threadId: 'my-thread-id' };
const comment = { ...thread, commentId: 'my-comment-id' };
const events = [
  ['userEntered', { connectionId: 4, userId: 'a-user-id', userInfo: null, enteredAt: at, numActiveUsers: 8 }],
  ['userLeft', { connectionId: 4, userId: 'a-user-id', userInfo: { name: 'John Doe' }, leftAt: at, numActiveUsers: 7 }],
  ['storageUpdated', { updatedAt: at }],
  ['roomCreated', { createdAt: at }],
  ['roomDeleted', { deletedAt: at }],
  ['ydocUpdated', { updatedAt: at }],
  ['commentCreated', { ...comment, createdAt: at, createdBy: 'my-user-id' }],
  ['commentEdited', { ...comment, editedAt: at }],
  ['commentDeleted', { ...comment, deletedAt: at }],
  ['commentReactionAdded', { ...comment, emoji: '👍', addedAt: at, addedBy: 'my-user-id' }],
  ['commentReactionRemoved', { ...comment, emoji: '👍', removedAt: at, removedBy: 'my-user-id' }],
  ['threadCreated', { ...thread, createdAt: at, createdBy: 'my-user-id' }],
  ['threadDeleted', { ...thread, deletedAt: at }],
  ['threadMetadataUpdated', { ...thread, updatedAt: at, updatedBy: 'my-user-id' }],
  ['commentMetadataUpdated', { ...comment, updatedAt: at, updatedBy: 'my-user-id' }],
  ['threadMarkedAsResolved', { ...thread, updatedAt: at, updatedBy: 'my-user-id' }],
  ['threadMarkedAsUnresolved', { ...thread, updatedAt: at, updatedBy: 'my-user-id' }],
  ['notification', { channel: 'email', kind: 'thread', userId: 'my-user-id', ...thread, inboxNotificationId: 'my-inbox-notification-id', createdAt: at, triggeredAt: at }],
];

describe('Liveblocks webhook handler', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    process.env.LIVEBLOCKS_WEBHOOK_SECRET = TEST_SECRET;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test.each(events)('handles %s', async (type, data) => {
    const res = await send(envelope(type, data));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type });
  });

  test('handles a custom $-prefixed notification kind', async () => {
    const res = await send(envelope('notification', { channel: 'email', kind: '$fileUpload', userId: 'my-user-id', inboxNotificationId: 'in_1' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'notification' });
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(envelope('maxConnectionsReached'));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('maxConnectionsReached');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('userEntered'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('userEntered');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('userEntered');
    const msgId = 'msg_both';
    const timestamp = now();
    const res = await request(app)
      .post('/webhooks/liveblocks')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', sign(payload, msgId, timestamp))
      .set('svix-id', 'msg_other')
      .set('svix-timestamp', timestamp)
      .set('svix-signature', 'v1,AAAA')
      .send(payload);
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(envelope('userEntered'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload = '{ "type" : "userEntered",\n "data":{"projectId":"p", "roomId":"r"} }';
    const res = await send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('threadCreated');
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/liveblocks')
      .set('Content-Type', 'application/json')
      .set('webhook-id', 'msg_1')
      .set('webhook-timestamp', now())
      .send(envelope('userEntered'));
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await request(app)
      .post('/webhooks/liveblocks')
      .set('Content-Type', 'application/json')
      .send(envelope('userEntered'));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('userEntered'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('userEntered');
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const payload = envelope('userEntered');
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp);
    const res = await send(envelope('userLeft'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('userEntered');
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.LIVEBLOCKS_WEBHOOK_SECRET;
    const res = await send(envelope('userEntered'));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.LIVEBLOCKS_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(envelope('userEntered'));
    expect(res.status).toBe(500);
  });
});
