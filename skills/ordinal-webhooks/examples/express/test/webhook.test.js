// The secret is a value YOU generate and configure on the Ordinal webhook's
// `headers` field. Ordinal issues NO signing secret and signs NOTHING — there is
// no HMAC to generate in these tests, only a static header to send.
const SECRET = 'a3f1c9e7b5d28046a3f1c9e7b5d280461122334455667788990011223344556677';

// Set env BEFORE requiring the app: SECRET_HEADER is resolved at module load.
process.env.ORDINAL_WEBHOOK_SECRET = SECRET;
delete process.env.ORDINAL_WEBHOOK_SECRET_HEADER; // exercise the default

const request = require('supertest');
const {
  app,
  verifyOrdinalSecret,
  resourceKeyFor,
  extractResource,
  idempotencyKeyFor,
  SECRET_HEADER,
} = require('../src/index');

// Documented delivery vectors, copied verbatim from the Ordinal docs.
const POST_PUBLISHED = {
  type: 'post.published',
  data: {
    post: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Q4 Product Launch Announcement',
      channel: 'LinkedIn',
      campaign: {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Launch 2025',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
      url: 'https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001',
      postUrl: 'https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678',
      profile: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Acme Inc',
        detail: 'acme-inc',
      },
      workspace: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        slug: 'acme',
        name: 'Acme Inc',
      },
      publishedBy: {
        id: '550e8400-e29b-41d4-a716-446655440010',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
      publishedAt: '2025-02-26T14:30:00.000Z',
    },
  },
  createdAt: '2025-02-26T14:30:00.000Z',
};

const POST_PUBLISH_FAILED = {
  type: 'post.publish_failed',
  data: {
    post: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Q4 Product Launch Announcement',
      channel: 'LinkedIn',
      error: 'Token expired',
      campaign: null,
      url: 'https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001',
      profile: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Acme Inc',
        detail: 'acme-inc',
      },
      scheduledPublishAt: '2025-03-01T14:00:00.000Z',
      workspace: { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'acme', name: 'Acme Inc' },
      createdBy: {
        id: '550e8400-e29b-41d4-a716-446655440010',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
      failedAt: '2025-03-01T14:00:05.000Z',
    },
  },
  createdAt: '2025-03-01T14:00:05.000Z',
};

const POST_COMMENT_CREATED = {
  type: 'post.comment.created',
  data: {
    comment: {
      id: '550e8400-e29b-41d4-a716-446655440050',
      message: "Looks good! Let's add a CTA at the end.",
      post: {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Q4 Product Launch Announcement',
        url: 'https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001',
      },
      workspace: { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'acme', name: 'Acme Inc' },
      createdBy: {
        id: '550e8400-e29b-41d4-a716-446655440010',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
      createdAt: '2025-02-26T16:00:00.000Z',
    },
  },
  createdAt: '2025-02-26T16:00:00.000Z',
};

const POST_APPROVAL_REQUESTED = {
  type: 'post.approval.requested',
  data: {
    approval: {
      post: {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Q4 Product Launch Announcement',
        url: 'https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001',
      },
      campaign: {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Launch 2025',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
      workspace: { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'acme', name: 'Acme Inc' },
      createdApprovals: [
        {
          id: '550e8400-e29b-41d4-a716-446655440700',
          isBlocking: true,
          message: 'Please review before we publish.',
          dueDate: '2025-02-28T17:00:00.000Z',
          createdAt: '2025-02-26T14:00:00.000Z',
          status: 'Requested',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440020',
            firstName: 'Alex',
            lastName: 'Rivera',
            email: 'alex@example.com',
          },
          requestedBy: {
            id: '550e8400-e29b-41d4-a716-446655440010',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
          },
        },
      ],
      existingApprovals: [],
    },
  },
  createdAt: '2025-02-26T14:00:00.000Z',
};

const CAMPAIGN_APPROVAL_REQUESTED = {
  type: 'campaign.approval.requested',
  data: {
    approval: {
      campaign: {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Launch 2025',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
      workspace: { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'acme', name: 'Acme Inc' },
      createdApprovals: [
        {
          id: '550e8400-e29b-41d4-a716-446655440710',
          isBlocking: true,
          message: 'Legal sign-off needed for this campaign.',
          dueDate: '2025-03-05T17:00:00.000Z',
          createdAt: '2025-02-26T14:00:00.000Z',
          status: 'Requested',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440021',
            firstName: 'Sam',
            lastName: 'Chen',
            email: 'sam@example.com',
          },
          requestedBy: {
            id: '550e8400-e29b-41d4-a716-446655440010',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
          },
        },
      ],
      existingApprovals: [],
    },
  },
  createdAt: '2025-02-26T14:00:00.000Z',
};

const SOCIAL_PROFILE_CONNECTED = {
  type: 'social_profile.connected',
  data: {
    profile: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Acme Inc',
      detail: 'acme-inc',
      channel: 'LinkedIn',
      profileImageUrl: 'https://media.licdn.com/dms/image/acme',
      workspace: { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'acme', name: 'Acme Inc' },
      connectedBy: {
        id: '550e8400-e29b-41d4-a716-446655440010',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
      connectedAt: '2025-02-26T10:00:00.000Z',
    },
  },
  createdAt: '2025-02-26T10:00:00.000Z',
};

const INVITE_ACCEPTED = {
  type: 'invite.accepted',
  data: {
    invite: {
      id: '550e8400-e29b-41d4-a716-446655440900',
      email: 'newuser@example.com',
      createdAt: '2025-02-25T09:00:00.000Z',
      acceptedAt: '2025-02-26T11:15:00.000Z',
      invitedBy: {
        id: '550e8400-e29b-41d4-a716-446655440010',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
      acceptedBy: {
        id: '550e8400-e29b-41d4-a716-446655440030',
        firstName: 'New',
        lastName: 'User',
        email: 'newuser@example.com',
      },
      workspace: { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'acme', name: 'Acme Inc' },
    },
  },
  createdAt: '2025-02-26T11:15:00.000Z',
};

/** Send a delivery the way Ordinal does: plain JSON POST plus your static header. */
function post(payload, { secret = SECRET, header = SECRET_HEADER } = {}) {
  const req = request(app).post('/webhooks/ordinal').set('Content-Type', 'application/json');
  if (secret !== null) req.set(header, secret);
  return req.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

beforeEach(() => {
  process.env.ORDINAL_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the secret header name', () => {
  it('defaults to x-webhook-secret, which is OUR choice and not an Ordinal header', () => {
    expect(SECRET_HEADER).toBe('x-webhook-secret');
  });
});

describe('verifyOrdinalSecret', () => {
  it('accepts a matching header', () => {
    expect(verifyOrdinalSecret({ [SECRET_HEADER]: SECRET }, SECRET)).toBe(true);
  });

  it('rejects a mismatched header', () => {
    expect(verifyOrdinalSecret({ [SECRET_HEADER]: 'wrong' }, SECRET)).toBe(false);
  });

  it('rejects a same-length near-miss (constant-time compare, not a prefix match)', () => {
    const nearMiss = SECRET.slice(0, -1) + (SECRET.endsWith('7') ? '8' : '7');
    expect(nearMiss).toHaveLength(SECRET.length);
    expect(verifyOrdinalSecret({ [SECRET_HEADER]: nearMiss }, SECRET)).toBe(false);
  });

  it('rejects a missing header without throwing (Buffer.from(undefined) would throw)', () => {
    expect(verifyOrdinalSecret({}, SECRET)).toBe(false);
  });

  it('rejects a repeated header (Node yields an array)', () => {
    expect(verifyOrdinalSecret({ [SECRET_HEADER]: [SECRET, SECRET] }, SECRET)).toBe(false);
  });

  it('rejects a shorter header without throwing (timingSafeEqual throws on length mismatch)', () => {
    expect(verifyOrdinalSecret({ [SECRET_HEADER]: 'a' }, SECRET)).toBe(false);
  });

  it('FAILS CLOSED when the expected secret is unset', () => {
    expect(verifyOrdinalSecret({ [SECRET_HEADER]: SECRET }, undefined)).toBe(false);
    expect(verifyOrdinalSecret({ [SECRET_HEADER]: SECRET }, '')).toBe(false);
  });
});

describe('POST /webhooks/ordinal authentication', () => {
  it('accepts a delivery carrying the configured secret header', async () => {
    const res = await post(POST_PUBLISHED);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 401 when the secret header is absent', async () => {
    const res = await post(POST_PUBLISHED, { secret: null });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when the secret header is wrong', async () => {
    const res = await post(POST_PUBLISHED, { secret: 'not-the-secret' });
    expect(res.status).toBe(401);
  });

  it('accepts the header regardless of case (HTTP header names are case-insensitive)', async () => {
    const res = await post(POST_PUBLISHED, { header: 'X-Webhook-Secret' });
    expect(res.status).toBe(200);
  });

  it('returns 500 (not 401) when ORDINAL_WEBHOOK_SECRET is unset — fail closed', async () => {
    delete process.env.ORDINAL_WEBHOOK_SECRET;
    const res = await post(POST_PUBLISHED);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Webhook secret not configured');
  });

  it('never accepts an unauthenticated delivery just because the secret is unset', async () => {
    delete process.env.ORDINAL_WEBHOOK_SECRET;
    const res = await post(POST_PUBLISHED, { secret: null });
    expect(res.status).not.toBe(200);
  });

  it('returns 400 for an authenticated body with no event type', async () => {
    const res = await post({ data: {}, createdAt: '2025-02-26T14:30:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload');
  });

  it('does not require a raw body — Ordinal signs nothing, so express.json() is safe', async () => {
    // Re-serialized (reordered/whitespace-changed) JSON would break an HMAC on a
    // signed provider. Here it must still be accepted.
    const reserialized = JSON.stringify(POST_PUBLISHED, null, 4);
    const res = await post(reserialized);
    expect(res.status).toBe(200);
  });
});

describe('resourceKeyFor — the data key differs per event family', () => {
  it.each([
    ['social_profile.connected', 'profile'],
    ['social_profile.disconnected', 'profile'],
    ['social_profile.reconnect_needed', 'profile'],
    ['post.created', 'post'],
    ['post.scheduled', 'post'],
    ['post.rescheduled', 'post'],
    ['post.unscheduled', 'post'],
    ['post.published', 'post'],
    ['post.publish_failed', 'post'],
    ['post.archived', 'post'],
    ['post.permanently_deleted', 'post'],
    ['post.content.edited', 'post'],
    ['post.comment.created', 'comment'],
    ['post.inline_comment.created', 'comment'],
    ['post.approval.requested', 'approval'],
    ['post.approval.approved', 'approval'],
    ['campaign.approval.requested', 'approval'],
    ['campaign.approval.approved', 'approval'],
    ['invite.created', 'invite'],
    ['invite.accepted', 'invite'],
  ])('%s -> data.%s', (type, key) => {
    expect(resourceKeyFor(type)).toBe(key);
  });

  it('covers all 20 documented topics', () => {
    const topics = [
      'social_profile.connected',
      'social_profile.disconnected',
      'social_profile.reconnect_needed',
      'post.created',
      'post.scheduled',
      'post.rescheduled',
      'post.unscheduled',
      'post.published',
      'post.publish_failed',
      'post.archived',
      'post.permanently_deleted',
      'post.content.edited',
      'post.comment.created',
      'post.inline_comment.created',
      'post.approval.requested',
      'post.approval.approved',
      'campaign.approval.requested',
      'campaign.approval.approved',
      'invite.created',
      'invite.accepted',
    ];
    expect(topics).toHaveLength(20);
    expect(topics.every((t) => resourceKeyFor(t) !== null)).toBe(true);
  });

  it('returns null for an unknown type', () => {
    expect(resourceKeyFor('something.else')).toBeNull();
    expect(resourceKeyFor(undefined)).toBeNull();
  });
});

describe('extractResource', () => {
  it('reads data.post for post events', () => {
    const { key, resource } = extractResource(POST_PUBLISHED);
    expect(key).toBe('post');
    expect(resource.title).toBe('Q4 Product Launch Announcement');
    expect(resource.postUrl).toContain('linkedin.com');
  });

  it('reads data.comment for comment events — NOT data.post', () => {
    const { key, resource } = extractResource(POST_COMMENT_CREATED);
    expect(key).toBe('comment');
    expect(POST_COMMENT_CREATED.data.post).toBeUndefined();
    expect(resource.message).toBe("Looks good! Let's add a CTA at the end.");
    expect(resource.post.title).toBe('Q4 Product Launch Announcement');
  });

  it('reads data.approval for post AND campaign approvals', () => {
    expect(extractResource(POST_APPROVAL_REQUESTED).key).toBe('approval');
    expect(extractResource(CAMPAIGN_APPROVAL_REQUESTED).key).toBe('approval');
    expect(extractResource(CAMPAIGN_APPROVAL_REQUESTED).resource.campaign.name).toBe('Launch 2025');
  });

  it('reads data.profile and data.invite', () => {
    expect(extractResource(SOCIAL_PROFILE_CONNECTED).resource.channel).toBe('LinkedIn');
    expect(extractResource(INVITE_ACCEPTED).resource.email).toBe('newuser@example.com');
  });

  it('returns an empty resource rather than throwing when data is missing', () => {
    expect(extractResource({ type: 'post.published' }).resource).toEqual({});
  });
});

describe('idempotencyKeyFor — our own convention, Ordinal ships no event id', () => {
  it('has no top-level id to use in the envelope', () => {
    expect(POST_PUBLISHED.id).toBeUndefined();
  });

  it('combines type, resource id and createdAt', () => {
    expect(idempotencyKeyFor(POST_PUBLISHED)).toBe(
      'post.published:550e8400-e29b-41d4-a716-446655440001:2025-02-26T14:30:00.000Z'
    );
  });

  it('falls back to the nested post id for post approvals', () => {
    expect(idempotencyKeyFor(POST_APPROVAL_REQUESTED)).toBe(
      'post.approval.requested:550e8400-e29b-41d4-a716-446655440001:2025-02-26T14:00:00.000Z'
    );
  });

  it('falls back to the nested campaign id for campaign approvals', () => {
    expect(idempotencyKeyFor(CAMPAIGN_APPROVAL_REQUESTED)).toBe(
      'campaign.approval.requested:550e8400-e29b-41d4-a716-446655440003:2025-02-26T14:00:00.000Z'
    );
  });

  it('is stable for identical redeliveries', () => {
    expect(idempotencyKeyFor(POST_PUBLISHED)).toBe(idempotencyKeyFor({ ...POST_PUBLISHED }));
  });
});

describe('event dispatch', () => {
  it.each([
    ['post.published', POST_PUBLISHED],
    ['post.publish_failed', POST_PUBLISH_FAILED],
    ['post.comment.created', POST_COMMENT_CREATED],
    ['post.approval.requested', POST_APPROVAL_REQUESTED],
    ['campaign.approval.requested', CAMPAIGN_APPROVAL_REQUESTED],
    ['social_profile.connected', SOCIAL_PROFILE_CONNECTED],
    ['invite.accepted', INVITE_ACCEPTED],
  ])('acknowledges a documented %s delivery with 200', async (_type, payload) => {
    const res = await post(payload);
    expect(res.status).toBe(200);
  });

  it('surfaces the publish failure reason from data.post.error', async () => {
    await post(POST_PUBLISH_FAILED);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Token expired'));
  });

  it('handles a null campaign and a null postUrl', async () => {
    const payload = {
      ...POST_PUBLISHED,
      data: { post: { ...POST_PUBLISHED.data.post, campaign: null, postUrl: null } },
    };
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('(no channel URL)'));
  });

  it('reads the plural `channels` array on post.created', async () => {
    const payload = {
      type: 'post.created',
      data: {
        post: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          title: 'Q4 Product Launch Announcement',
          status: 'draft',
          channels: ['LinkedIn'],
          campaign: null,
          url: 'https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001',
          labels: [
            {
              id: '550e8400-e29b-41d4-a716-446655440400',
              name: 'Launch',
              color: '#ffffff',
              backgroundColor: '#1d4ed8',
            },
          ],
          workspace: { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'acme', name: 'Acme Inc' },
          createdBy: {
            id: '550e8400-e29b-41d4-a716-446655440010',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
          },
          createdAt: '2025-02-26T09:00:00.000Z',
          linkedIn: { profile: { id: '550e8400-e29b-41d4-a716-446655440002' }, copy: 'Hi', assets: [] },
          x: null,
        },
      },
      createdAt: '2025-02-26T09:00:00.000Z',
    };
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[LinkedIn]'));
  });

  it('acknowledges an unknown future event type without throwing', async () => {
    const res = await post({
      type: 'post.something_new',
      data: { post: { id: 'x' } },
      createdAt: '2025-02-26T14:30:00.000Z',
    });
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled Ordinal event'));
  });
});

describe('health check', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
