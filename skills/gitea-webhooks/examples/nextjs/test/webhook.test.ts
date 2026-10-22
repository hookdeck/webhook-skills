import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/gitea/route';

const secret = 'test_gitea_secret';

beforeAll(() => {
  process.env.GITEA_WEBHOOK_SECRET = secret;
});

// Gitea's X-Gitea-Signature is the bare hex HMAC-SHA256 of the raw body
function sign(payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeRequest(
  event: string,
  body: string,
  opts: { contentType?: string; signature?: string | null } = {}
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'x-gitea-event': event,
    'x-gitea-delivery': 'test-delivery-id',
  };
  const signature = opts.signature === undefined ? sign(body, secret) : opts.signature;
  if (signature !== null) headers['x-gitea-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/gitea', { method: 'POST', headers, body });
}

describe('Gitea webhook route', () => {
  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest('push', '{"ref":"refs/heads/main"}', { signature: null }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty signature (no secret configured in Gitea)', async () => {
    const res = await POST(makeRequest('push', '{"ref":"refs/heads/main"}', { signature: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest('push', '{"ref":"refs/heads/main"}', { signature: 'deadbeef' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const body = '{"ref":"refs/heads/main"}';
    const res = await POST(makeRequest('push', body, { signature: sign(body, 'wrong_secret') }));
    expect(res.status).toBe(400);
  });

  const events: Array<[string, object]> = [
    ['push', { ref: 'refs/heads/main', head_commit: { message: 'Test commit' } }],
    ['pull_request', { action: 'opened', number: 1, pull_request: { title: 'Test PR' } }],
    ['issues', { action: 'opened', issue: { number: 1, title: 'Test Issue' } }],
    ['issue_comment', { action: 'created', issue: { number: 1 }, comment: { user: { login: 'octo' } } }],
    ['create', { ref: 'v1.0.0', ref_type: 'tag' }],
    ['delete', { ref: 'old-branch', ref_type: 'branch' }],
    ['release', { action: 'published', release: { tag_name: 'v1.0.0' } }],
    ['fork', { forkee: {} }],
  ];

  it.each(events)('returns 200 for a valid %s event', async (event, payload) => {
    const res = await POST(makeRequest(event, JSON.stringify(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies form-encoded deliveries over the raw body', async () => {
    const body = 'payload=' + encodeURIComponent(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(makeRequest('push', body, { contentType: 'application/x-www-form-urlencoded' }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const res = await POST(makeRequest('push', 'not json'));
    expect(res.status).toBe(400);
  });
});
