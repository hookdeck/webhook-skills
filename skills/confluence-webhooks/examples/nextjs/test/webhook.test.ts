import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../app/webhooks/confluence/route';

const SECRET = 'test_secret_up_to_255_chars';

// Same scheme Confluence uses: HMAC-SHA256 hex of the raw body.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/confluence', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const pageCreated = JSON.stringify({
  timestamp: 1596182511300,
  event: 'page_created',
  userKey: 'ff80818154ec9913015501e194f601d8',
  page: { id: 309264476 },
});

describe('Confluence webhook', () => {
  beforeEach(() => {
    process.env.CONFLUENCE_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid sha256= signature', async () => {
    const res = await POST(makeRequest(pageCreated, { 'x-hub-signature': `sha256=${sign(pageCreated)}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signature without the sha256= prefix', async () => {
    const res = await POST(makeRequest(pageCreated, { 'x-hub-signature': sign(pageCreated) }));
    expect(res.status).toBe(200);
  });

  it('verifies against the raw body for non-JSON content types', async () => {
    const res = await POST(
      makeRequest(pageCreated, { 'content-type': 'text/plain', 'x-hub-signature': `sha256=${sign(pageCreated)}` })
    );
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await POST(makeRequest(pageCreated, { 'x-hub-signature': `sha256=${sign(pageCreated, 'other')}` }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(
      makeRequest(pageCreated.replace('309264476', '1'), { 'x-hub-signature': `sha256=${sign(pageCreated)}` })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a different algorithm prefix', async () => {
    const res = await POST(makeRequest(pageCreated, { 'x-hub-signature': `sha1=${sign(pageCreated)}` }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(pageCreated));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed (wrong length) signature without throwing', async () => {
    const res = await POST(makeRequest(pageCreated, { 'x-hub-signature': 'sha256=abc' }));
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
    const res = await POST(makeRequest(body, { 'x-hub-signature': `sha256=${sign(body)}` }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed but invalid JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-hub-signature': `sha256=${sign(body)}` }));
    expect(res.status).toBe(400);
  });
});
