const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.BUNDLE_SOCIAL_WEBHOOK_SECRET = 'test_bundle_social_secret';

const { app } = require('../src/index');

const secret = process.env.BUNDLE_SOCIAL_WEBHOOK_SECRET;

/** Sign the way bundle.social does: hex HMAC-SHA256 of the raw body. */
function sign(body, key = secret) {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

const postPublished = JSON.stringify({
  type: 'post.published',
  data: {
    id: 'post_abc123',
    title: 'My awesome post',
    status: 'POSTED',
    teamId: 'team_xyz',
    organizationId: 'org_123',
    error: null,
    errors: null,
    externalData: { INSTAGRAM: { id: '17900000000000000', permalink: 'https://www.instagram.com/p/example/' } },
  },
});

function send(body, signature) {
  const req = request(app)
    .post('/webhooks/bundle-social')
    .set('Content-Type', 'application/json')
    .set('User-Agent', 'bundlesocial');
  if (signature !== undefined) req.set('x-signature', signature);
  return req.send(body);
}

describe('bundle.social webhook endpoint', () => {
  it('returns 200 for a valid signature', async () => {
    const res = await send(postPublished, sign(postPublished));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 400 when x-signature is missing', async () => {
    const res = await send(postPublished);
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const res = await send(postPublished, sign(postPublished, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const tampered = postPublished.replace('POSTED', 'ERROR');
    const res = await send(tampered, sign(postPublished));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed signature', async () => {
    const res = await send(postPublished, 'not-a-real-signature');
    expect(res.status).toBe(400);
  });

  it('verifies against the exact bytes, not re-serialized JSON', async () => {
    // Same JSON, different whitespace: the signature over the pretty body must not
    // validate the compact body.
    const pretty = JSON.stringify(JSON.parse(postPublished), null, 2);
    const ok = await send(pretty, sign(pretty));
    expect(ok.status).toBe(200);
    const mismatch = await send(postPublished, sign(pretty));
    expect(mismatch.status).toBe(400);
  });

  it.each([
    ['post.published', { id: 'post_1', status: 'ERROR', error: 'Token expired' }],
    ['post.externally-deleted', { id: 'pp_1', postId: 'post_1', socialAccountType: 'TIKTOK' }],
    ['comment.published', { id: 'comment_1', status: 'POSTED' }],
    ['social-account.created', { id: 'sa_1', type: 'INSTAGRAM', username: 'mybrand' }],
    ['social-account.updated', { id: 'sa_1', socialAction: { type: 'disconnect-check', details: { deleteOn: '2026-02-20T20:30:00.000Z' } } }],
    ['social-account.deleted', { id: 'sa_1' }],
    ['team.created', { id: 'team_1', name: 'Marketing Team' }],
    ['team.updated', { id: 'team_1' }],
    ['team.deleted', { id: 'team_1' }],
    ['conversation.message.created', { id: 'msg_1' }], // unknown to this handler: still 200
  ])('returns 200 for a signed %s event', async (type, data) => {
    const body = JSON.stringify({ type, data });
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
