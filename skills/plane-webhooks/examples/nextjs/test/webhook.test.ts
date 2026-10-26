import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/plane/route';

const secret = 'plane_wh_test_secret_key';

beforeAll(() => {
  process.env.PLANE_WEBHOOK_SECRET = secret;
});

// Plane's X-Plane-Signature is the bare hex HMAC-SHA256 of the raw body
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

// Payloads follow the examples in Plane's webhook docs
const commentCreated = {
  version: 'v2',
  delivery_id: '01ab9316-f978-4449-bad6-dce958be8454',
  event_id: '0afa042d-92a9-4326-bdca-5ff5490dbf09',
  entity_id: '088a83b9-a53f-4dda-b2bc-c860cf455997',
  entity_type: 'issue',
  event: 'workitem.comment.created',
  webhook_id: '285f087b-e1e0-4f90-b9f4-0b720acfac04',
  workspace_id: 'd250cd44-fa71-42c2-b2b5-3c73227288fc',
  data: {
    id: '088a83b9-a53f-4dda-b2bc-c860cf455997',
    name: 'Webhook Test Work Item 2',
    comment: {
      id: '4797f841-c731-4e55-971f-d9cfe1938dfb',
      access: 'INTERNAL',
      actor_id: '88fc36c8-73b0-4547-81c7-96b70f61835e',
      issue_id: '088a83b9-a53f-4dda-b2bc-c860cf455997',
      edited_at: null,
      comment_stripped: 'Webhook Test Comment',
    },
  },
  previous_attributes: {},
};

const linkCreated = {
  version: 'v2',
  delivery_id: '616d98fe-35a7-4431-a233-db40936c8339',
  event_id: '7b3c1e2a-8f94-4b12-a781-2c5e9d4f6a03',
  entity_id: '8661bdfa-098f-434d-8e44-b1f32de62406',
  entity_type: 'issue_link',
  event: 'workitem.link.created',
  webhook_id: '285f087b-e1e0-4f90-b9f4-0b720acfac04',
  workspace_id: 'd250cd44-fa71-42c2-b2b5-3c73227288fc',
  data: {
    id: 'a6f8e562-49d2-4c19-bc4b-2bcb9d917da1',
    url: 'http://google.com',
    title: '',
    issue_id: '8661bdfa-098f-434d-8e44-b1f32de62406',
  },
  previous_attributes: {},
};

function makeRequest(
  body: unknown,
  opts: { contentType?: string; signature?: string | null } = {}
): NextRequest {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'x-plane-delivery': 'test-delivery-id',
  };
  const signature = opts.signature === undefined ? sign(raw) : opts.signature;
  if (signature !== null) headers['x-plane-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/plane', { method: 'POST', headers, body: raw });
}

describe('Plane webhook route', () => {
  it('returns 401 for a missing signature', async () => {
    const res = await POST(makeRequest(commentCreated, { signature: null }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an empty signature', async () => {
    const res = await POST(makeRequest(commentCreated, { signature: '' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    expect((await POST(makeRequest(commentCreated, { signature: 'not-a-signature' }))).status).toBe(401);
    expect((await POST(makeRequest(commentCreated, { signature: 'z'.repeat(64) }))).status).toBe(401);
    const prefixed = `sha256=${sign(JSON.stringify(commentCreated))}`;
    expect((await POST(makeRequest(commentCreated, { signature: prefixed }))).status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    const raw = JSON.stringify(commentCreated);
    const res = await POST(makeRequest(raw, { signature: sign(raw, 'plane_wh_other') }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body was changed after signing', async () => {
    const signature = sign(JSON.stringify(commentCreated));
    const res = await POST(makeRequest({ ...commentCreated, entity_id: 'changed' }, { signature }));
    expect(res.status).toBe(401);
  });

  it('accepts a signed workitem.comment.created event', async () => {
    const res = await POST(makeRequest(commentCreated));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts uppercase hex', async () => {
    const signature = sign(JSON.stringify(commentCreated)).toUpperCase();
    const res = await POST(makeRequest(commentCreated, { signature }));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, including whitespace', async () => {
    const res = await POST(makeRequest(JSON.stringify(commentCreated, null, 2)));
    expect(res.status).toBe(200);
  });

  it('verifies bodies with a non-JSON content type', async () => {
    const res = await POST(makeRequest(commentCreated, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts an event without a dedicated handler', async () => {
    const res = await POST(makeRequest(linkCreated));
    expect(res.status).toBe(200);
  });

  it('accepts the work item example whose event is an enum label', async () => {
    const body = { ...commentCreated, event: 'WebhookScope.ScopeChoices.WORK_ITEM_UPDATED' };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for signed JSON that is not an object', async () => {
    expect((await POST(makeRequest('[]'))).status).toBe(400);
    expect((await POST(makeRequest('null'))).status).toBe(400);
  });

  it('returns 400 when event is missing or not a string', async () => {
    expect((await POST(makeRequest({ version: 'v2' }))).status).toBe(400);
    expect((await POST(makeRequest({ event: 42 }))).status).toBe(400);
  });

  it('does not fail on wrong-typed nested fields', async () => {
    const bodies = [
      { ...commentCreated, data: 'oops' },
      { ...commentCreated, data: [] },
      { ...commentCreated, data: { name: 7, comment: 'oops' } },
      { ...commentCreated, data: { comment: { comment_stripped: { x: 1 } } } },
      { ...commentCreated, event: 'workitem.updated', previous_attributes: 'oops' },
    ];
    for (const body of bodies) {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
    }
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.PLANE_WEBHOOK_SECRET;
    try {
      const res = await POST(makeRequest(commentCreated));
      expect(res.status).toBe(500);
    } finally {
      process.env.PLANE_WEBHOOK_SECRET = secret;
    }
  });
});
