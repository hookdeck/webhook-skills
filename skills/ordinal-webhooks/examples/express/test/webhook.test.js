// Generated with: ordinal-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// A test secret in Ordinal's format: "whsec_" + base64(key bytes). The HMAC key
// is the decoded part.
const SECRET = 'whsec_' + Buffer.from('ordinal-test-signing-key-0123456789').toString('base64');

process.env.ORDINAL_WEBHOOK_SECRET = SECRET;

const { app, resourceKeyFor } = require('../src/index');

/** Sign per Standard Webhooks: base64(HMAC-SHA256(key, `${id}.${ts}.${body}`)). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature } = {}) {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/ordinal').set(headers).send(rawBody);
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

const POST_PUBLISH_FAILED = {
  "type": "post.publish_failed",
  "data": {
    "post": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Q4 Product Launch Announcement",
      "channel": "LinkedIn",
      "error": "Token expired",
      "campaign": null,
      "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
      "profile": {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Acme Inc",
        "detail": "acme-inc"
      },
      "scheduledPublishAt": "2025-03-01T14:00:00.000Z",
      "workspace": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "slug": "acme",
        "name": "Acme Inc"
      },
      "createdBy": {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@example.com"
      },
      "failedAt": "2025-03-01T14:00:05.000Z"
    }
  },
  "createdAt": "2025-03-01T14:00:05.000Z"
};

const MENTION_CREATED = {
  "type": "linkedin.monitoring.mention.created",
  "data": {
    "mention": {
      "id": "550e8400-e29b-41d4-a716-446655440060",
      "activityUrn": "urn:li:activity:7123456789012345678",
      "commentary": "Shoutout to Acme for the launch.",
      "postUrl": "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678",
      "publishedAt": "2026-10-28T20:03:26.911Z",
      "lastModifiedAt": "2026-10-28T20:03:27.155Z",
      "isCompanyAuthor": false,
      "author": {
        "urn": "urn:li:person:abc",
        "name": "Alex Roe",
        "profileImageUrl": "https://example.com/alex.png",
        "type": "User"
      },
      "companyPage": {
        "id": "550e8400-e29b-41d4-a716-446655440061",
        "name": "Acme Inc",
        "profileImageUrl": "https://example.com/acme.png"
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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts post.published', async () => {
    const body = JSON.stringify(POST_PUBLISHED);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Post published: Q4 Product Launch Announcement')
    );
  });

  it('accepts post.publish_failed and reads data.post.error', async () => {
    const body = JSON.stringify(POST_PUBLISH_FAILED);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Publish failed'));
  });

  it('accepts linkedin.monitoring.mention.created', async () => {
    const body = JSON.stringify(MENTION_CREATED);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Company page mentioned'));
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
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
  });
});

describe('rejected deliveries', () => {
  it('rejects a body changed after signing', async () => {
    const body = JSON.stringify(POST_PUBLISHED);
    const headers = signedHeaders(body);
    const res = await post(body.replace('LinkedIn', 'X'), headers);
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
    const body = JSON.stringify(POST_PUBLISHED);
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.ORDINAL_WEBHOOK_SECRET;
    const body = JSON.stringify(POST_PUBLISHED);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});

describe('resourceKeyFor', () => {
  it.each([
    ['social_profile.reconnect_needed', 'profile'],
    ['post.published', 'post'],
    ['post.comment.created', 'comment'],
    ['post.inline_comment.created', 'comment'],
    ['post.approval.requested', 'approval'],
    ['campaign.approval.approved', 'approval'],
    ['invite.accepted', 'invite'],
    ['linkedin.monitoring.comment.edited', 'comment'],
    ['linkedin.monitoring.mention.created', 'mention'],
  ])('%s reads data.%s', (type, key) => {
    expect(resourceKeyFor(type)).toBe(key);
  });
});
