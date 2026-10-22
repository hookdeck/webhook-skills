const request = require('supertest');
const crypto = require('crypto');

const TEST_SECRET = 'test_shortcut_secret';
process.env.SHORTCUT_WEBHOOK_SECRET = TEST_SECRET;

const { app, verifyShortcutWebhook } = require('../src/index');

// Shortcut signs the raw body with HMAC-SHA256 and sends the hex digest
function sign(body, secret = TEST_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeEvent(actions) {
  return JSON.stringify({
    id: '595285dc-9c43-4b9c-a1e6-0cd9aff5b084',
    changed_at: '2017-06-27T16:20:44Z',
    primary_id: 16927,
    member_id: '56d8a839-1c52-437f-b981-c3a15a11d6d4',
    version: 'v1',
    actions,
    references: [],
  });
}

const storyUpdate = makeEvent([
  {
    id: 16927,
    entity_type: 'story',
    action: 'update',
    name: 'test story',
    changes: { workflow_state_id: { new: 1495, old: 1493 } },
  },
]);

describe('verifyShortcutWebhook', () => {
  it('accepts a valid signature', () => {
    const body = Buffer.from(storyUpdate);
    expect(verifyShortcutWebhook(body, sign(body), TEST_SECRET)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    const body = Buffer.from(storyUpdate);
    expect(verifyShortcutWebhook(body, sign(body, 'other'), TEST_SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = sign(storyUpdate);
    expect(verifyShortcutWebhook(Buffer.from(storyUpdate + ' '), sig, TEST_SECRET)).toBe(false);
  });

  it('rejects missing, empty, malformed and wrong-length signatures', () => {
    const body = Buffer.from(storyUpdate);
    expect(verifyShortcutWebhook(body, undefined, TEST_SECRET)).toBe(false);
    expect(verifyShortcutWebhook(body, '', TEST_SECRET)).toBe(false);
    expect(verifyShortcutWebhook(body, 'not-hex', TEST_SECRET)).toBe(false);
    expect(verifyShortcutWebhook(body, 'abcd', TEST_SECRET)).toBe(false);
  });

  it('accepts an uppercase hex signature', () => {
    const body = Buffer.from(storyUpdate);
    expect(verifyShortcutWebhook(body, sign(body).toUpperCase(), TEST_SECRET)).toBe(true);
  });
});

describe('POST /webhooks/shortcut', () => {
  it('returns 200 for a valid story update', async () => {
    const res = await request(app)
      .post('/webhooks/shortcut')
      .set('Content-Type', 'application/json')
      .set('Payload-Signature', sign(storyUpdate))
      .send(storyUpdate);
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/shortcut')
      .set('Content-Type', 'text/plain')
      .set('Payload-Signature', sign(storyUpdate))
      .send(storyUpdate);
    expect(res.status).toBe(200);
  });

  it.each([
    ['story create'],
    ['story delete'],
    ['epic update'],
    ['story-comment create'],
    ['label create'],
  ])('acknowledges %s', async (kind) => {
    const [entity_type, action] = kind.split(' ');
    const body = makeEvent([{ id: 1, entity_type, action, name: 'x', changes: {} }]);
    const res = await request(app)
      .post('/webhooks/shortcut')
      .set('Content-Type', 'application/json')
      .set('Payload-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/shortcut')
      .set('Content-Type', 'application/json')
      .send(storyUpdate);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/shortcut')
      .set('Content-Type', 'application/json')
      .set('Payload-Signature', sign(storyUpdate, 'wrong_secret'))
      .send(storyUpdate);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/shortcut')
      .set('Content-Type', 'text/plain')
      .set('Payload-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
