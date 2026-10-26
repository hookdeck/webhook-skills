// Generated with: canny-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Canny secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('canny-test-signing-key-0123456789').toString('base64');

process.env.CANNY_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Canny does (Standard Webhooks). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature, contentType = 'application/json' } = {}) {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': contentType,
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/canny').set(headers).send(rawBody);
}

const event = (type, objectType, object) => ({
  created: '2026-10-22T10:00:00.000Z',
  object,
  objectType,
  type,
});

const postObject = () => ({
  id: '6a2889c586d7b8843bf4cf05',
  board: { id: '6a2889c586d7b8843bf4cf01', name: 'Feature Requests' },
  status: 'planned',
  title: 'An awesome feature request',
});

const postCreated = () => event('post.created', 'post', postObject());

beforeEach(() => {
  process.env.CANNY_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts post.created', async () => {
    const body = JSON.stringify(postCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Post created: "An awesome feature request"'));
  });

  it('accepts post.status_changed', async () => {
    const body = JSON.stringify(event('post.status_changed', 'post', postObject()));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('status changed to "planned"'));
  });

  it.each([
    ['post.edited', 'post'],
    ['post.deleted', 'post'],
    ['post.tag_added', 'post'],
    ['post.tag_removed', 'post'],
    ['post.jira_issue_linked', 'post'],
    ['post.jira_issue_unlinked', 'post'],
    ['comment.created', 'comment'],
    ['comment.edited', 'comment'],
    ['comment.deleted', 'comment'],
    ['vote.created', 'vote'],
    ['vote.deleted', 'vote'],
  ])('accepts %s', async (type, objectType) => {
    const body = JSON.stringify(event(type, objectType, { id: 'obj_1' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('obj_1'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('board.something_new', 'board', { id: 'b1' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled Canny event type'));
  });

  it('verifies any content type (raw body, not JSON-parsed)', async () => {
    const body = JSON.stringify(postCreated());
    const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of two space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(postCreated());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('ignores the legacy canny-* headers', async () => {
    const body = JSON.stringify(postCreated());
    const headers = {
      ...signedHeaders(body),
      'canny-timestamp': String(now()),
      'canny-nonce': 'abc123',
      'canny-signature': 'not-checked',
    };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(postCreated());
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(postCreated());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a request carrying only the legacy canny-* headers', async () => {
    const body = JSON.stringify(postCreated());
    const res = await post(body, {
      'content-type': 'application/json',
      'canny-timestamp': String(now()),
      'canny-nonce': 'abc123',
      'canny-signature': 'deadbeef',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(postCreated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    const other = 'whsec_' + Buffer.from('another-secret-0123456789abcdef').toString('base64');
    const body = JSON.stringify(postCreated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(postCreated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('planned', 'complete'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute window (library behaviour)', async () => {
    const body = JSON.stringify(postCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(postCreated());
    const id = 'msg_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when CANNY_WEBHOOK_SECRET is not set', async () => {
    delete process.env.CANNY_WEBHOOK_SECRET;
    const body = JSON.stringify(postCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
