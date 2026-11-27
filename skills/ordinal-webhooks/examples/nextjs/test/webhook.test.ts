// Generated with: ordinal-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/ordinal/route';

// A test secret in Ordinal's format: "whsec_" + base64(key bytes).
const SECRET = 'whsec_' + Buffer.from('ordinal-test-signing-key-0123456789').toString('base64');

/** Sign per Standard Webhooks: base64(HMAC-SHA256(key, `${id}.${ts}.${body}`)). */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost/webhooks/ordinal', { method: 'POST', headers, body: rawBody })
  );
}

// Payload examples from Ordinal's per-event pages.
const POST_PUBLISHED = {
  "type": "post.published",
  "data": {
    "post": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Q4 Product Launch Announcement",
      "channel": "LinkedIn",
      "campaign": {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "name": "Launch 2025",
        "startDate": "2025-01-01",
        "endDate": "2025-12-31"
      },
      "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
      "postUrl": "https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678",
      "profile": {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Acme Inc",
        "detail": "acme-inc"
      },
      "workspace": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "slug": "acme",
        "name": "Acme Inc"
      },
      "publishedBy": {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@example.com"
      },
      "publishedAt": "2025-02-26T14:30:00.000Z"
    }
  },
  "createdAt": "2025-02-26T14:30:00.000Z"
};

const COMMENT_CREATED = {
  "type": "linkedin.monitoring.comment.created",
  "data": {
    "comment": {
      "id": "550e8400-e29b-41d4-a716-446655440070",
      "urn": "urn:li:comment:(activity:7123456789012345678,9001)",
      "commentary": "Nice post",
      "imageUrl": null,
      "commentUrl": "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678?commentUrn=urn%3Ali%3Acomment%3A%28activity%3A7123456789012345678%2C9001%29&dashCommentUrn=urn%3Ali%3Afsd_comment%3A%289001%2Curn%3Ali%3Aactivity%3A7123456789012345678%29",
      "publishedAt": "2026-10-28T20:03:26.911Z",
      "lastModifiedAt": "2026-10-28T20:03:27.155Z",
      "parentCommentId": null,
      "isCompanyAuthor": false,
      "author": {
        "urn": "urn:li:person:abc",
        "name": "Jane Doe",
        "profileImageUrl": "https://example.com/jane.png",
        "type": "User"
      },
      "post": {
        "id": "550e8400-e29b-41d4-a716-446655440071",
        "commentary": "Company post",
        "url": "https://app.tryordinal.com/acme/monitoring?tab=comments&postId=550e8400-e29b-41d4-a716-446655440071",
        "postUrl": "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678",
        "publishedAt": "2026-10-01T12:00:00.000Z"
      },
      "companyPage": {
        "id": "550e8400-e29b-41d4-a716-446655440061",
        "name": "Acme Inc",
        "profileImageUrl": "https://example.com/acme.png"
      },
      "profile": {
        "id": "550e8400-e29b-41d4-a716-446655440061",
        "name": "Acme Inc",
        "profileImageUrl": "https://example.com/acme.png",
        "type": "Organization"
      },
      "workspace": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "slug": "acme",
        "name": "Acme Inc"
      }
    }
  },
  "createdAt": "2026-10-28T20:03:33.037Z"
};

beforeEach(() => {
  process.env.ORDINAL_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts post.published', async () => {
    const body = JSON.stringify(POST_PUBLISHED);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts linkedin.monitoring.comment.created and reads data.comment', async () => {
    const body = JSON.stringify(COMMENT_CREATED);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('linkedin.monitoring.comment.created on Acme Inc')
    );
  });

  it('accepts a match on either signature during a rotation', async () => {
    const body = JSON.stringify(POST_PUBLISHED);
    const id = 'msg_rotation';
    const ts = String(now());
    const oldSecret = 'whsec_' + Buffer.from('ordinal-old-signing-key-0123456789').toString('base64');
    const signature = `${sign(body, id, ts, oldSecret)} ${sign(body, id, ts)}`;
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature }));
    expect(res.status).toBe(200);
  });

  it('acknowledges a repeated webhook-id without processing it again', async () => {
    const body = JSON.stringify(POST_PUBLISHED);
    const headers = signedHeaders(body, { id: 'msg_duplicate' });
    expect((await post(body, headers)).status).toBe(200);
    const res = await post(body, headers);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('rejected deliveries', () => {
  it('rejects a body changed after signing', async () => {
    const body = JSON.stringify(POST_PUBLISHED);
    const res = await post(body.replace('LinkedIn', 'X'), signedHeaders(body));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    const body = JSON.stringify(POST_PUBLISHED);
    const other = 'whsec_' + Buffer.from('some-other-signing-key-0123456789').toString('base64');
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp more than five minutes old', async () => {
    const body = JSON.stringify(POST_PUBLISHED);
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a delivery with no signature headers', async () => {
    const res = await post(JSON.stringify(POST_PUBLISHED), { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.ORDINAL_WEBHOOK_SECRET;
    const body = JSON.stringify(POST_PUBLISHED);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
