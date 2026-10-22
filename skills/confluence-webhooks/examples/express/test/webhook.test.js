const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_secret_up_to_255_chars';
process.env.CONFLUENCE_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

// Same scheme Confluence uses: HMAC-SHA256 hex of the raw body.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const pageCreated = JSON.stringify({
  timestamp: 1596182511300,
  event: 'page_created',
  userKey: 'ff80818154ec9913015501e194f601d8',
  page: { id: 309264476 },
});

function post(body, headers = {}) {
  return request(app).post('/webhooks/confluence').set(headers).send(body);
}

describe('Confluence webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid sha256= signature', async () => {
    const res = await post(pageCreated, {
      'Content-Type': 'application/json',
      'X-Hub-Signature': `sha256=${sign(pageCreated)}`,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signature without the sha256= prefix', async () => {
    const res = await post(pageCreated, {
      'Content-Type': 'application/json',
      'X-Hub-Signature': sign(pageCreated),
    });
    expect(res.status).toBe(200);
  });

  it('verifies against the raw body for non-JSON content types', async () => {
    const res = await post(pageCreated, {
      'Content-Type': 'text/plain',
      'X-Hub-Signature': `sha256=${sign(pageCreated)}`,
    });
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(pageCreated, {
      'Content-Type': 'application/json',
      'X-Hub-Signature': `sha256=${sign(pageCreated, 'other')}`,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post(pageCreated.replace('309264476', '1'), {
      'Content-Type': 'application/json',
      'X-Hub-Signature': `sha256=${sign(pageCreated)}`,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a different algorithm prefix', async () => {
    const res = await post(pageCreated, {
      'Content-Type': 'application/json',
      'X-Hub-Signature': `sha1=${sign(pageCreated)}`,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(pageCreated, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed (wrong length) signature without throwing', async () => {
    const res = await post(pageCreated, {
      'Content-Type': 'application/json',
      'X-Hub-Signature': 'sha256=abc',
    });
    expect(res.status).toBe(400);
  });

  it.each([
    ['page_updated', { page: { id: 1 } }],
    ['page_removed', { page: { id: 1 } }],
    ['blog_created', { blog: { id: 2 } }],
    ['comment_created', { comment: { id: 3 } }],
    ['space_created', { space: { key: 'DOC' } }],
    ['label_added', {}],
  ])('handles %s', async (event, extra) => {
    const body = JSON.stringify({ timestamp: 1, event, ...extra });
    const res = await post(body, {
      'Content-Type': 'application/json',
      'X-Hub-Signature': `sha256=${sign(body)}`,
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed but invalid JSON body', async () => {
    const body = 'not json';
    const res = await post(body, {
      'Content-Type': 'text/plain',
      'X-Hub-Signature': `sha256=${sign(body)}`,
    });
    expect(res.status).toBe(400);
  });
});
