import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, verifyAuth0Authorization } from '../app/webhooks/auth0/route';

const TOKEN = 'test_event_stream_token';

beforeAll(() => {
  process.env.AUTH0_EVENT_STREAM_TOKEN = TOKEN;
});

// Shape of the user.created example in Auth0's Event Catalog.
function sampleEvent(type = 'user.created') {
  return {
    specversion: '1.0',
    type,
    source: 'urn:auth0:example.auth0app.com',
    id: 'evt_vjFVP5pVdfvsfRKatshkVV',
    time: '2025-02-01T12:34:56Z',
    data: {
      object: {
        user_id: 'auth0|507f1f77bcf86cd799439020',
        email: 'user1@example.com',
        created_at: '2025-02-01T12:34:56Z',
        updated_at: '2025-02-01T12:34:56Z',
      },
    },
    a0tenant: 'my-tenant',
    a0stream: 'est_vjFVP5pVdfvsfRKatshkVV',
  };
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/webhooks/auth0', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('verifyAuth0Authorization', () => {
  it('accepts the Bearer header', () => {
    expect(verifyAuth0Authorization(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it('rejects the token without the Bearer prefix', () => {
    expect(verifyAuth0Authorization(TOKEN, TOKEN)).toBe(false);
  });

  it('rejects a missing header or token', () => {
    expect(verifyAuth0Authorization(null, TOKEN)).toBe(false);
    expect(verifyAuth0Authorization(`Bearer ${TOKEN}`, undefined)).toBe(false);
  });
});

describe('POST /webhooks/auth0', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await POST(makeRequest(sampleEvent()));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong token', async () => {
    const res = await POST(makeRequest(sampleEvent(), 'Bearer wrong_token_value_here'));
    expect(res.status).toBe(401);
  });

  it('returns 204 for a valid Authorization header', async () => {
    const res = await POST(makeRequest(sampleEvent(), `Bearer ${TOKEN}`));
    expect(res.status).toBe(204);
  });

  it('accepts other event types', async () => {
    for (const type of ['user.updated', 'user.deleted', 'organization.member.added', 'group.created']) {
      const res = await POST(makeRequest(sampleEvent(type), `Bearer ${TOKEN}`));
      expect(res.status).toBe(204);
    }
  });
});
