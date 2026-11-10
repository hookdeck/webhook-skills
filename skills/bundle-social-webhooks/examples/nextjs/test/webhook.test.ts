import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/bundle-social/route';

const WEBHOOK_SECRET = 'test_bundle_social_secret';

beforeAll(() => {
  process.env.BUNDLE_SOCIAL_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

/** Sign the way bundle.social does: hex HMAC-SHA256 of the raw body. */
function sign(body: string, key = WEBHOOK_SECRET): string {
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

function makeRequest(body: string, signature?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'bundlesocial' };
  if (signature !== undefined) headers['x-signature'] = signature;
  return new Request('http://localhost/webhooks/bundle-social', {
    method: 'POST',
    headers,
    body,
  }) as unknown as import('next/server').NextRequest;
}

describe('bundle.social webhook route', () => {
  it('returns 200 for a valid signature', async () => {
    const res = await POST(makeRequest(postPublished, sign(postPublished)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 400 when x-signature is missing', async () => {
    const res = await POST(makeRequest(postPublished));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const res = await POST(makeRequest(postPublished, sign(postPublished, 'wrong_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const res = await POST(makeRequest(postPublished.replace('POSTED', 'ERROR'), sign(postPublished)));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed signature', async () => {
    const res = await POST(makeRequest(postPublished, 'not-a-real-signature'));
    expect(res.status).toBe(400);
  });

  it('verifies against the exact bytes, not re-serialized JSON', async () => {
    const pretty = JSON.stringify(JSON.parse(postPublished), null, 2);
    expect((await POST(makeRequest(pretty, sign(pretty)))).status).toBe(200);
    expect((await POST(makeRequest(postPublished, sign(pretty)))).status).toBe(400);
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
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });
});
